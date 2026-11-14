import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {createOvaWorld} from '../src/colony/ihan/crater-ecosystem.mjs';
import {createOvaNavigation} from '../src/colony/ihan/navigation.mjs';
import {calculateEclss} from '../src/colony/ihan/eclss.mjs';
import {prepareOvaRover} from '../src/colony/ihan/assets.mjs';
import { LANDER_PAD, COMMS_PAD } from '../src/data/colonyLayout.js';

const context = () => ({
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  createRadialGradient:()=>({addColorStop(){}}),putImageData(){},fillRect(){},fillText(){},
  beginPath(){},arc(){},ellipse(){},fill(){},stroke(){},moveTo(){},lineTo(){},
});
let scene,world;
beforeEach(()=>{
  vi.stubGlobal('document',{querySelectorAll:()=>[],getElementById:()=>null,createElement:()=>({getContext:context}),createElementNS:()=>({addEventListener(){},removeEventListener(){},style:{}})});
  scene=new THREE.Scene(); world=createOvaWorld(scene); scene.updateMatrixWorld(true);
});
afterEach(()=>{
  world.dispose(); const resources=new Set();
  scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [o.material].flat())if(m){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});
  resources.forEach(r=>r.dispose()); vi.unstubAllGlobals();
});
describe('İhan Düz Ova world (real source ed79956)',()=>{
  it('keeps the three connected dome floors and source camera positions',()=>{
    for(const x of [-9,0,9,-4.5,4.5]) expect(world.isInsideFloor(x,0)).toBe(true);
    expect(world.isInsideFloor(0,5)).toBe(false);
    expect(world.blocksFootprint(0,7,5,5)).toBe(true);
    expect(world.blocksFootprint(0,20,2,2)).toBe(false);
    expect(world.views.panorama.position[2]).toBe(28);
    expect(world.views.base.position).toEqual([24,16,30]);
    expect(world.views.solar.target[0]).toBe(-57);
    const domes=world.habitat.children.filter(o=>o.isGroup && o.position.y===world.floorY);
    expect(domes).toHaveLength(3);
  });
  it('keeps 42 solar tables instanced with batched wiring and live switch, rocks instanced, and adds no shadow light',()=>{
    const farm=scene.getObjectByName('MarsSolarFarm');
    const instances=[]; farm.traverse(o=>{if(o.isInstancedMesh) instances.push(o)});
    expect(instances.some(o=>o.count===42)).toBe(true);
    expect(instances.filter(o=>o.count===168)).toHaveLength(2);
    expect(world.solar.switchPosition).toBeTruthy();
    const meshCount=[]; farm.traverse(o=>{if(o.isMesh)meshCount.push(o)});
    expect(meshCount.length).toBeLessThan(65);


    const lights=[];scene.traverse(o=>{if(o.isLight)lights.push(o);});
    expect(lights).toHaveLength(4); // single airlock: side domes have no chamber light expect(lights.every(o=>!o.castShadow)).toBe(true);
    const rocks=scene.children.filter(o=>o.isInstancedMesh);
    expect(rocks).toHaveLength(5);expect(rocks.reduce((sum,o)=>sum+o.count,0)).toBe(7140);
    expect(scene.getObjectByName('Mars_environment')).toBeUndefined();
  });
  it('matches rendered ground triangles at the lander, pad, and solar field',()=>{
    const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
    for(const [x,z]of [[0,0],[LANDER_PAD.x,LANDER_PAD.z],[COMMS_PAD.x,COMMS_PAD.z],[30,30],[-57,46],[149,-133]]){
      ray.set(new THREE.Vector3(x,100,z),down);
      // İhan's analytic height vs the rendered triangle: within 1 cm (walker feet never float/sink visibly).
      expect(Math.abs(world.ground.userData.heightAt(x,z)-ray.intersectObject(world.ground)[0].point.y)).toBeLessThan(.01);
    }
  });
  it('clears prepared pads of every rendered rock and building and retains the live beacon after batching',()=>{
    for (const pad of [LANDER_PAD,COMMS_PAD]) {
      for (const box of world.obstacles) {
        if (pad===COMMS_PAD && box.min.x===pad.x-pad.radius) continue
        const x=THREE.MathUtils.clamp(pad.x,box.min.x,box.max.x),z=THREE.MathUtils.clamp(pad.z,box.min.z,box.max.z)
        expect(Math.hypot(x-pad.x,z-pad.z)).toBeGreaterThan(pad.radius)
      }
      scene.updateMatrixWorld(true)
      for (const mesh of scene.children.filter(o=>o.isInstancedMesh)) {
        mesh.geometry.computeBoundingBox()
        for (let i=0;i<mesh.count;i++) {
          const matrix=new THREE.Matrix4(); mesh.getMatrixAt(i,matrix)
          const box=mesh.geometry.boundingBox.clone().applyMatrix4(matrix)
          const x=THREE.MathUtils.clamp(pad.x,box.min.x,box.max.x),z=THREE.MathUtils.clamp(pad.z,box.min.z,box.max.z)
          expect(Math.hypot(x-pad.x,z-pad.z)).toBeGreaterThan(pad.radius)
        }
      }
    }
    const beacon=world.comms.group.getObjectByName('Comms_red_obstruction_beacon')
    expect(beacon).toBeTruthy(); expect(world.comms.telemetry.beaconOn).toBe(true)
    world.comms.update(.5,new THREE.Vector3(0,1,0)); expect(beacon.material.emissiveIntensity).toBeLessThan(.1)
    expect(world.comms.telemetry.direction).toEqual([0,1,0])
    world.comms.update(1,new THREE.Vector3(0,-1,0)); expect(beacon.material.emissiveIntensity).toBeGreaterThan(5)
    expect(world.comms.telemetry.direction[1]).toBeGreaterThan(.5) // Relay fallback stays above the horizon.
    expect(world.blocksFootprint(COMMS_PAD.x,COMMS_PAD.z,1,1)).toBe(true)
    expect(createOvaNavigation(world).collides(COMMS_PAD.x,COMMS_PAD.z)).toBe(true)
  });
  it('removes scene-refraction passes from shared rover lenses without changing the hierarchy',()=>{
    const rover=new THREE.Group(), lens=new THREE.MeshPhysicalMaterial({transmission:1});
    const metal=new THREE.MeshStandardMaterial({metalness:.8});
    rover.add(new THREE.Mesh(new THREE.BoxGeometry(),lens),new THREE.Mesh(new THREE.BoxGeometry(),lens),new THREE.Mesh(new THREE.BoxGeometry(),metal));
    const children=[...rover.children];prepareOvaRover(rover);
    expect(rover.children).toEqual(children);expect(lens.transmission).toBe(0);
    expect(lens.transparent).toBe(true);expect(lens.depthWrite).toBe(false);expect(metal.metalness).toBe(.8);
    rover.traverse(o=>o.geometry?.dispose());lens.dispose();metal.dispose();
  });
  it('gates entry/exit by proximity, contains the player, and allows both tunnels',()=>{
    const nav=createOvaNavigation(world);
    expect(nav.interact(0,14)).toBeNull(); expect(nav.inside).toBe(false);
    expect(nav.collides(0,0)).toBe(true); expect(nav.collides(-57,42)).toBe(true);
    const entry=nav.interact(0,7.5); expect(nav.inside).toBe(true);
    expect(entry).toMatchObject({x:0,z:2.45,y:world.floorY,yaw:0});
    for(const x of [-9,-4.5,0,4.5,9])expect(nav.collides(x,0)).toBe(false);
    expect(nav.collides(0,5)).toBe(true); expect(nav.interact(9,0)).toBeNull();
    const exit=nav.interact(0,2.45); expect(exit.z).toBeCloseTo(7.35,9); expect(exit.yaw).toBe(Math.PI);
    expect(nav.inside).toBe(false);nav.interact(0,6);nav.reset();expect(nav.inside).toBe(false);
  });
});
describe('İhan ECLSS reference calculator',()=>{
  it('preserves the original three-person rates and electrolysis stoichiometry',()=>{
    const stored=calculateEclss(10,0,false);
    expect(stored.water).toBeCloseTo(105.6);expect(stored.oxygen).toBeCloseTo(25.2);expect(stored.foodKcal).toBe(91050);
    const recycled=calculateEclss(10,90,true);
    expect(recycled.savedWater).toBeCloseTo(95.04);expect(recycled.water).toBeCloseTo(10.56+25.2*9/8);expect(recycled.oxygen).toBe(0);
  });
});
