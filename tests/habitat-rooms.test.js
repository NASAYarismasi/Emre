import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { createOvaWorld } from '../src/colony/ihan/crater-ecosystem.mjs';
import { createOvaNavigation } from '../src/colony/ihan/navigation.mjs';
import { createHabitatRooms, mapHabitatTelemetry, HABITAT_CLEARANCE } from '../src/colony/ihan/habitat-rooms.mjs';
import { batchStaticLeaves } from '../src/colony/scene/static-model.mjs';

const ctx = new Proxy({}, { get: (_, key) => key === 'createImageData' ? (w,h) => ({data:new Uint8ClampedArray(w*h*4)})
  : key === 'getImageData' ? (x,y,w,h) => ({data:new Uint8ClampedArray(w*h*4)})
  : key === 'measureText' ? value => ({width:value.length*19})
  : String(key).startsWith('create') ? () => ({addColorStop(){}}) : () => {}, set: () => true });
let scene, world, rooms, navigation;
beforeAll(() => {
  vi.stubGlobal('document', { querySelectorAll:()=>[], getElementById:()=>null,
    createElement:()=>({getContext:()=>ctx}), createElementNS:()=>({addEventListener(){},removeEventListener(){},style:{}}) });
  scene = new T.Scene(); world = createOvaWorld(scene);
  rooms = createHabitatRooms(world); navigation = createOvaNavigation(world);
});
afterAll(() => {
  rooms.dispose(); world.dispose();
  const resources = new Set();
  scene.traverse(o => { if(o.geometry)resources.add(o.geometry); for(const m of [o.material].flat())if(m){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);} });
  resources.forEach(r=>r.dispose()); vi.unstubAllGlobals();
});

describe('Samet habitat in the current İhan domes', () => {
  it('keeps all furniture vertices and view positions inside the existing dome floors at ova.floorY', () => {
    rooms.root.updateWorldMatrix(true,true);
    const point = new T.Vector3();
    rooms.root.traverse(part => {
      if (!part.isMesh) return;
      const positions = part.geometry.getAttribute('position');
      for (let i=0;i<positions.count;i++) {
        point.fromBufferAttribute(positions,i).applyMatrix4(part.matrixWorld);
        expect(world.isInsideFloor(point.x,point.z), `${part.name}: ${point.x}, ${point.z}`).toBe(true);
        expect(point.y).toBeGreaterThanOrEqual(world.floorY-1e-6);
      }
    });
    for (const view of Object.values(rooms.views)) {
      expect(world.isInsideFloor(view.position[0],view.position[2])).toBe(true);
      expect(view.position[1]).toBeGreaterThan(world.floorY);
    }
  });

  it('allows continuous suited-body walking from the airlock through both tunnels to every room and back', () => {
    navigation.reset();
    const entry = navigation.interact(0,world.entryZ);
    expect(entry).toMatchObject({x:0,z:2.45,y:world.floorY});
    // Actual navigation.collides, sampled every 2 cm; no teleport between route segments.
    let from = [entry.x,entry.z];
    const route = [[0,0],[0,-.9],[0,0],[-4.5,0],[-9,0],[-9,-.85],[-9,0],[0,0],[4.5,0],[9,0],[9,.15],[9,0],[9,-1.6],[9,0],[0,0],[0,2.45]];
    for (const to of route) {
      const steps = Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/.02);
      for(let i=0;i<=steps;i++) {
        const x=from[0]+(to[0]-from[0])*i/steps, z=from[1]+(to[1]-from[1])*i/steps;
        expect(navigation.collides(x,z), `blocked route ${x}, ${z}`).toBe(false);
      }
      from=to;
    }
    expect(navigation.interact(...from)).not.toBeNull(); expect(navigation.inside).toBe(false);
  });

  it('blocks console, bunks, lab bench and hygiene equipment with a body clearance', () => {
    navigation.reset(); navigation.interact(0,world.entryZ);
    for (const point of [[0,-2.1],[9,1.5],[-9,-1.98],[9.29,-2.34]]) expect(navigation.collides(...point)).toBe(true);
    const console = world.indoorObstacles[0];
    expect(navigation.collides(console.max.x+HABITAT_CLEARANCE-.01,-2.1)).toBe(true);
    expect(navigation.collides(console.max.x+HABITAT_CLEARANCE+.01,-2.1)).toBe(false);
  });

  it('keeps an operable privacy curtain and collision gate after host batching', () => {
    const keep = new Set(world.locks.flatMap(lock=>[lock.inner,lock.outer])); keep.add(rooms.root);
    batchStaticLeaves(world.habitat,keep);
    expect(rooms.batching.after).toBeLessThan(rooms.batching.before/3);
    const lights=[]; rooms.root.traverse(o=>{if(o.isLight)lights.push(o);}); expect(lights).toHaveLength(0);
    expect(rooms.interact(9,-1.6)).toBe(true);
    expect(navigation.collides(9,-1.08)).toBe(true);
    expect(rooms.telemetry.privacyClosed).toBe(true);
    expect(rooms.interact(9,-1.6)).toBe(true);
    expect(navigation.collides(9,-1.08)).toBe(false);
    expect(rooms.interact(9,-1.08)).toBe(false); // no closing through the body
  });
});

describe('habitat live screen mapping', () => {
  const source = {lifeSupport:{oxygenKg:8.25,air:{removedCO2Kg:2.5},waterL:45.8,powerKW:6.02,power:{batteryKWh:80,solarKW:9.3}},
    rover:{measurements:[{instrument:'MEDA',stationName:'Delta',summary:'Basınç 720 Pa',simulated:true}],samples:[{tube:3,stationName:'Delta',sealed:true}]}};
  it('maps real life-support quantities, battery/solar, and the latest rover measurement and sealed sample', () => {
    const mapped=mapHabitatTelemetry(source);
    expect(mapped.atmosphere).toEqual(['O₂  8.25 kg','CO₂ temizlenen  2.50 kg']);
    expect(mapped.utilities).toEqual(['Su  45.8 L','Güç  6.02 kW','Batarya  80.0 kWh','Güneş  9.30 kW']);
    expect(mapped.laboratory).toContain('MEDA · Delta'); expect(mapped.laboratory).toContain('Basınç 720 Pa');
    expect(mapped.laboratory).toContain('Tüp 3 · Delta · mühürlü'); expect(mapped.laboratory).toContain('Simülasyon ölçümü');
    expect(mapHabitatTelemetry({...source,colonyPower:{batteryKWh:5,solarKW:0}}).utilities[2]).toContain('5.0 kWh');
  });
  it('does not fabricate readings when telemetry or rover science is missing', () => {
    const mapped=mapHabitatTelemetry();
    expect(mapped.atmosphere[0]).toContain('—'); expect(mapped.laboratory[0]).toBe('Rover ölçümü bekleniyor');
    expect(mapped.laboratory).toContain('Mühürlü numune yok');
  });
  it('throttles telemetry sampling and texture updates to two per second, including after a long frame', () => {
    const read=vi.fn(()=>source), before=rooms.telemetry.screenUpdates;
    rooms.update(0,read); rooms.update(.24,read); rooms.update(.25,read);
    expect(read).toHaveBeenCalledTimes(1);
    rooms.update(.01,read); expect(read).toHaveBeenCalledTimes(2);
    rooms.update(100,read); expect(read).toHaveBeenCalledTimes(3);
    rooms.update(0,read); expect(read).toHaveBeenCalledTimes(3);
    expect(rooms.telemetry.screenUpdates-before).toBe(3);
    expect(rooms.telemetry.screens).toEqual(mapHabitatTelemetry(source));
  });
});
