import {advanceFacilityWater} from "./power/facility-water.mjs";
import {supplyHabitatOxygen} from './power/habitat-oxygen.mjs';
import {createPowerController} from './power/controller.mjs';
import { createSystemConsoles } from '../scene/system-consoles.mjs';
/** IHAN-SRC — İhan's real a7d5ce6 installations and sera-demo airlock, hosted by the shared scene. */
import * as T from 'three';
import { createAirSystem } from './hava.mjs';
import { createWaterSystem } from './su.mjs';
import { createGreenhouse } from './sera.mjs';
import { createLifeSupport, syncLifeSupport, lifeSupportTelemetry } from '../../sim/colonyLifeSupport.js';
import { findAnimatedObjects, batchStaticLeaves } from '../scene/static-model.mjs';

function createOxygenLine(scene,heightAt,plantHeight,habitatFloor){
  const material=new T.MeshStandardMaterial({color:0x548c9d,metalness:.45,roughness:.46});
  const ground=(x,z)=>heightAt(x,z)-.45;
  const points=[
    [17.45,plantHeight+3.95,4.1],[16.95,plantHeight+3.95,4.1],
    [16.95,ground(16.95,4.1),4.1],[14,ground(14,2),2],
    [13.65,ground(13.65,0),0],[13.65,habitatFloor+.48,0],[12.52,habitatFloor+.48,0],
  ].map(p=>new T.Vector3(...p));
  const path=new T.CurvePath();
  for(let index=1;index<points.length;index++)path.add(new T.LineCurve3(points[index-1],points[index]));
  const geometry=new T.TubeGeometry(path,80,.065,8,false);
  const mesh=new T.Mesh(geometry,material);
  mesh.name='MOXIE to Habitat oxygen service line';
  scene.add(mesh);
  return {dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}

export function createLifeSupportFacilities(scene, heightAt, initialState, habitatFloor) {
  const power=createPowerController();
  const origin = { x: 26, z: -11, y: heightAt(26, -11) };
  const greenhouse = createGreenhouse(scene);
  greenhouse.group.position.set(origin.x, origin.y, origin.z);
  const air = createAirSystem(scene, { x: 19, z: 6, heightAt });
  const water = createWaterSystem(scene, { x: 64, z: -26, heightAt });
  const oxygenLine=createOxygenLine(scene,heightAt,air.group.position.y,habitatFloor);
  const machinery = [air, water].map(model => new T.Box3().setFromObject(model.group).expandByScalar(.32));
  // Host perf: ~920 static parts (pipes, flanges, frames, panels) become per-material batches.
  // Whatever İhan's own API moves (doors, fans, drill) is detected by running it once and stays live.
  const keepGreenhouse = findAnimatedObjects(greenhouse.group, () => { greenhouse.setAirlock(true, true, true); greenhouse.setNight(true); });
  greenhouse.setNight(false); greenhouse.setAirlock(false, false);
  const keepAir = findAnimatedObjects(air.group, () => { air.update({ producer: true }); for (let i = 1; i < 4; i++) air.frame(i, .5); });
  const keepWater = findAnimatedObjects(water.group, () => { water.update({ extractor: true }); for (let i = 1; i < 4; i++) water.frame(i, .5); });
  air.update({ producer: false }); water.update({ extractor: false });
  const batched = [batchStaticLeaves(greenhouse.group, keepGreenhouse), batchStaticLeaves(air.group, keepAir), batchStaticLeaves(water.group, keepWater)];
  let support = createLifeSupport(initialState), colony = initialState;
  let inside = false, cycle = null, time = 0, lastDraw = -1;
  const greenhouseControls={led:'auto',irrigation:false};
  const lightsOn=()=>greenhouseControls.led==='on'||greenhouseControls.led==='auto'&&api.night;
  const applyGreenhouse=()=>{greenhouse.setNight(lightsOn()&&Boolean(power.telemetry.live?.greenhouse?.duty));greenhouse.setIrrigation(greenhouseControls.irrigation);};
  const worldOf=set=>[...set].map(o=>o.getWorldPosition(new T.Vector3()));
  const vents=worldOf(keepAir).filter(p=>p.y>1.5),drill=worldOf(keepWater)[0]??new T.Vector3(64,heightAt(64,-26),-26);
  function electricalTelemetry(){
    const telemetry=lifeSupportTelemetry(support),grid=power.telemetry;
    const live=grid.live;
    return {...telemetry,electrical:grid,
      powerKW:live?['habitat','water','moxie','greenhouse'].reduce((sum,key)=>sum+(live[key]?.supply??0),0)+live.heater:0,
      availableKW:(live?.production??0)+(live?.groups??[]).reduce((sum,g)=>sum+g.draw,0),
      spentKWh:Object.values(grid.state.loadEnergy).reduce((sum,value)=>sum+value,0)};
  }
  function consoleTelemetry(){const t=electricalTelemetry();return {...t,electrical:power.telemetry,oxygenHours:t.crew?t.oxygenKg/(t.crew*.84/24):0,waterDays:t.crew?t.waterL/(t.crew*3.52):0,
    controls:{air:{fans:Boolean(t.air.fans)},water:{extract:Boolean(t.water.extractor),recycle:Boolean(t.water.recycler)},greenhouse:{...greenhouseControls}},
    greenhouse:{ledOn:lightsOn()&&Boolean(power.telemetry.live?.greenhouse?.duty),pumpOn:greenhouseControls.irrigation},airlock:cycle?cycle.awaiting?'awaiting-door':'cycling':'idle'};}
  const consoles=createSystemConsoles({scene,heightAt,placements:{air:{x:23.4,z:9.4},water:{x:60.4,z:-21.6},greenhouse:{x:origin.x+3.4,z:origin.z+9.8},habitat:{x:2.5,z:7.4},solar:{x:-40.5,z:31}},
    emitters:{airVents:vents.length?vents:[new T.Vector3(19,2.8,6)],drill:new T.Vector3(drill.x,heightAt(drill.x,drill.z),drill.z),beds:Array.from({length:6},(_,i)=>new T.Vector3(origin.x+1.85+(i%2)*1.65,origin.y+1.3,origin.z-3.8+Math.floor(i/2)*3.35))},getTelemetry:consoleTelemetry,setControl:(system,key,value)=>{if(system!=='greenhouse')return;if(key==='led'&&['auto','on','off'].includes(value))greenhouseControls.led=value;if(key==='irrigation'&&typeof value==='boolean')greenhouseControls.irrigation=value;applyGreenhouse();}});
  const direction = new T.Vector3();
  const local = camera => ({ x: camera.position.x - origin.x, z: camera.position.z - origin.z });
  function facing(camera, exiting) { camera.getWorldDirection(direction); return exiting ? direction.z > .5 : direction.z < -.5; }
  function near(camera) {
    const p = local(camera);
    return Math.abs(p.x) < 1.15 && Math.abs(p.z - (inside ? 6.07 : 8.81)) < 2.1 && facing(camera, inside);
  }
  function move(fps, x, z, yaw) { fps.teleport(new T.Vector3(origin.x+x, origin.y+.25+1.65, origin.z+z), 0, yaw); }
  function prompt(camera) {
    if (cycle) return cycle.awaiting ? (cycle.exiting ? 'E · Dış kapıyı aç' : 'E · Sera kapısını aç') : 'Hava kilidi · Basınç eşitleniyor…';
    return near(camera) ? (inside ? 'E · Sera hava kilidinden çık' : 'E · Sera hava kilidine gir') : '';
  }
  function draw() {
    const t = electricalTelemetry(), n = value => value.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
    const values = { oxygen: `${n(t.oxygenKg)} kg`, produced: `${n(t.air.generatedKg)} kg`, consumed: `${n(t.air.consumedKg)} kg`,
      co2: `${n(t.air.removedCO2Kg)} kg`, water: `${n(t.waterL)} L`, extracted: `${n(t.water.extractedL)} L`, recycled: `${n(t.water.recoveredL)} L`,
      power: `${n(t.powerKW)} / ${n(t.availableKW)} kW` };
    for (const [key,value] of Object.entries(values)) { const el = document.getElementById(`life-${key}`); if (el) el.textContent = value; }
  }
  const api={
    consoles,power,
    forecast(){return power.forecast({water:support.water,air:support.air,crew:support.crew,lamp:lightsOn()});},
    reserveChargingEnergy(requested){return power.consumeEnergy(requested);},
    get inside() { return inside || Boolean(cycle); },
    get floorY() { return origin.y + .25; },
    get telemetry() { return { ...electricalTelemetry(), greenhouse: { inside, airlock: cycle ? cycle.awaiting ? 'awaiting-door' : 'cycling' : 'idle', night: this.night, ledOn:lightsOn()&&Boolean(power.telemetry.live?.greenhouse?.duty),pumpOn:greenhouseControls.irrigation } }; },
    night: false,
    prompt:camera=>prompt(camera)||consoles.prompt(camera),
    interact(camera, fps) {
      if(!cycle&&!inside&&consoles.interact(camera))return true;
      if (cycle) {
        if (cycle.awaiting && facing(camera, cycle.exiting)) { cycle.awaiting = false; cycle.released = true; cycle.elapsed = 4.2; }
        return true;
      }
      if (!near(camera)) return false;
      cycle = { elapsed: 0, exiting: inside, awaiting: false, released: false };
      inside = false;
      move(fps, 0, 7.45, cycle.exiting ? Math.PI : 0);
      greenhouse.setAirlock(cycle.exiting, !cycle.exiting, true);
      return true;
    },
    collides(x, z) {
      const px = x-origin.x, pz = z-origin.z;
      if (cycle) return Math.abs(px) > .86 || pz < 6.48 || pz > 8.35;
      if (inside) {
        if (Math.abs(px)>4.55 || pz< -5.5 || pz>5.4) return true;
        if (px< -2.55 && px> -3.95 && pz<4.9 && pz> -5.1) return true;
        for(let row=0;row<3;row++)for(let col=0;col<2;col++)
          if(Math.abs(px-(1.85+col*1.65))<.95 && Math.abs(pz-(-3.8+row*3.35))<1.45)return true;
        return false;
      }
      return this.blocksFootprint(x,z,.3,.3)||consoles.blocks(x,z);
    },
    blocksFootprint(x,z,hx,hz) {
      return (Math.abs(x-origin.x)<5.5+hx && z+hz>origin.z-6.4 && z-hz<origin.z+6.4)
        || (Math.abs(x-origin.x)<1.4+hx && z+hz>origin.z+6.3 && z-hz<origin.z+9)
        || machinery.some(b=>x+hx>b.min.x && x-hx<b.max.x && z+hz>b.min.z && z-hz<b.max.z);
    },
    sync(next) { support = syncLifeSupport(support, colony, next); colony = next; air.update(support.air); water.update(support.water); draw(); },
    update(dt, environment, camera, fps) {
      time += dt;
      power.syncWater(support.water);
      power.update(environment,lightsOn(),(grid,hours,state)=>{
        support={...support,
          air:supplyHabitatOxygen(support.air,hours,grid,state,support.crew),
          water:advanceFacilityWater(support.water,hours,grid,support.crew)};
        state.water=support.water.cleanL;
        state.iceKg=support.water.iceKg;
      });
      applyGreenhouse();
      const night = environment.sunElevationDeg < 0;
      if (night !== this.night) { this.night = night; applyGreenhouse(); }
      if (cycle) {
        cycle.elapsed += dt;
        if (cycle.elapsed >= 1.2) greenhouse.setAirlock(false,false,true);
        if (cycle.elapsed >= 4.2) {
          if (!cycle.released) { cycle.awaiting = true; greenhouse.setAirlock(false,false); }
          else {
            greenhouse.setAirlock(!cycle.exiting, cycle.exiting);
            if (cycle.elapsed >= 5.5) {
              inside = !cycle.exiting;
              move(fps, 0, inside ? 5.1 : 10.1, inside ? 0 : Math.PI);
              cycle = null; greenhouse.setAirlock(false,false);
            }
          }
        }
      }
      air.update({...support.air,producer:Boolean(power.telemetry.live?.moxie?.duty)}); water.update(support.water);
      air.frame(time,dt); water.frame(time,dt); greenhouse.frame(time);
      consoles.update(dt);
      if (time-lastDraw>.25) { draw(); lastDraw=time; }
    },
    reset(next) { power.reset();support=createLifeSupport(next); colony=next; inside=false; cycle=null;  greenhouseControls.led='auto';greenhouseControls.irrigation=false;applyGreenhouse();greenhouse.setAirlock(false,false); draw(); },
    views: {
      greenhouse: { position:[origin.x+13,origin.y+8,origin.z+19], target:[origin.x,origin.y+2,origin.z] },
      air: { position:[25,5.5,17], target:[19,1.6,6] },
      water: { position:[55,6.1,-15], target:[62,1.65,-26] },
    },
    dispose() { oxygenLine.dispose();consoles.dispose();greenhouse.dispose(); air.dispose(); water.dispose(); for (const m of [greenhouse,air,water]) m.group.removeFromParent(); },
  };
  return api;
}
