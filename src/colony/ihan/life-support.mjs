/** IHAN-SRC — İhan's installations and sera-demo airlock, hosted by the shared scene.
 * GAME ASSUMPTION: ed79956 site layout, console offsets, collision margins and airlock pacing.
 */
import { playPressureHiss, disposePressureAudio } from './greenhouse-pressure.mjs';
import * as T from 'three';
import { createAirSystem } from './hava.mjs';
import { createWaterSystem } from './su.mjs';
import { createGreenhouse } from './sera.mjs';
import { createLifeSupport, stepLifeSupport, syncLifeSupport, lifeSupportTelemetry, setLifeControl, greenhouseLightsOn } from '../../sim/colonyLifeSupport.js';
import { createSystemConsoles } from '../scene/system-consoles.mjs';
import { findAnimatedObjects, batchStaticLeaves } from '../scene/static-model.mjs';

export function createLifeSupportFacilities(scene, heightAt, initialState, solar) {
  const origin = { x: 19, z: 25, y: heightAt(19, 25) };
  const greenhouse = createGreenhouse(scene);
  greenhouse.group.position.set(origin.x, origin.y, origin.z);
  const air = createAirSystem(scene, { x: 19, z: 6, heightAt });
  const water = createWaterSystem(scene, { x: 64, z: -26, heightAt });
  const machinery = [air, water].map(model => new T.Box3().setFromObject(model.group).expandByScalar(.32));
  // Host perf: ~920 static parts (pipes, flanges, frames, panels) become per-material batches.
  // Whatever İhan's own API moves (doors, fans, drill) is detected by running it once and stays live.
  const keepGreenhouse = findAnimatedObjects(greenhouse.group, () => { greenhouse.setAirlock(true, true, true); greenhouse.setNight(true); });
  greenhouse.setNight(false); greenhouse.setAirlock(false, false);
  const keepAir = findAnimatedObjects(air.group, () => { air.update({ producer: true }); for (let i = 1; i < 4; i++) air.frame(i, .5); });
  const keepWater = findAnimatedObjects(water.group, () => { water.update({ extractor: true }); for (let i = 1; i < 4; i++) water.frame(i, .5); });
  air.update({ producer: false }); water.update({ extractor: false });
  for (const object of keepGreenhouse) if (object.isGroup) batchStaticLeaves(object);
  const batched = [batchStaticLeaves(greenhouse.group, keepGreenhouse), batchStaticLeaves(air.group, keepAir), batchStaticLeaves(water.group, keepWater)];
  let support = createLifeSupport(initialState), colony = initialState;
  let airlockState = 'idle', sunElevation = 30;
  // Facility computers + effects. Emitters sit on the parts İhan's API actually moves (fan rotors, drill).
  const worldOf = set => [...set].map(o => o.getWorldPosition(new T.Vector3()));
  const airVents = worldOf(keepAir).filter(p => p.y > origin.y + 1.5);
  const drill = worldOf(keepWater)[0] ?? new T.Vector3(64, heightAt(64, -26), -26);
  const beds = []; for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++)
    beds.push(new T.Vector3(origin.x + 1.85 + col * 1.65, origin.y + 1.35, origin.z - 3.8 + row * 3.35));
  const consoles = createSystemConsoles({ scene, heightAt,
    placements: { air: { x: 23.4, z: 9.4 }, water: { x: 60.4, z: -21.6 }, greenhouse: { x: 23.4, z: 34.6 }, power: { x: -19.9, z: 62.5 } },
    emitters: { airVents: airVents.length ? airVents : [new T.Vector3(19, origin.y + 2.8, 6)], drill: new T.Vector3(drill.x, heightAt(drill.x, drill.z), drill.z), beds },
    getTelemetry: () => ({ ...lifeSupportTelemetry(support), airlock: airlockState }),
    setControl: (system, key, value) => { support = setLifeControl(support, system, key, value); solar?.setPower(lifeSupportTelemetry(support).power); applyVisuals(); draw(); } });
  function applyVisuals() {
    // Visuals follow the simulated units: fans spin only when producing, drill only when extracting.
    const ledOn = support.greenhouse?.ledOn ?? greenhouseLightsOn(support.controls, sunElevation);
    greenhouse.setNight(ledOn);
  }
  let inside = false, cycle = null, time = 0, lastClock = null, lastDraw = -1;
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
    const t = lifeSupportTelemetry(support), n = value => value.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
    const values = { oxygen: `${n(t.oxygenKg)} kg`, produced: `${n(t.air.generatedKg)} kg`, consumed: `${n(t.air.consumedKg)} kg`,
      co2: `${n(t.air.removedCO2Kg)} kg`, water: `${n(t.waterL)} L`, extracted: `${n(t.water.extractedL)} L`, recycled: `${n(t.water.recoveredL)} L`,
      power: `${n(t.powerKW)} / ${n(t.availableKW)} kW` };
    for (const [key,value] of Object.entries(values)) { const el = document.getElementById(`life-${key}`); if (el) el.textContent = value; }
  }
  return {
    get inside() { return inside || Boolean(cycle); },
    get floorY() { return origin.y + .25; },
    get telemetry() { const t = lifeSupportTelemetry(support); return { ...t, greenhouseSite: { ...origin }, greenhouse: { ...t.greenhouse, inside, airlock: cycle ? cycle.awaiting ? 'awaiting-door' : 'cycling' : 'idle', night: this.night }, console: consoles.open }; },
    consoles,
    night: false,
    prompt: camera => prompt(camera) || consoles.prompt(camera),
    interact(camera, fps) {
      if (!cycle && !inside && consoles.interact(camera)) return true;
      if (cycle) {
        if (cycle.awaiting && facing(camera, cycle.exiting)) { cycle.awaiting = false; cycle.released = true; cycle.elapsed = 4.2; }
        return true;
      }
      if (!near(camera)) return false;
      cycle = { elapsed: 0, exiting: inside, awaiting: false, released: false };
      playPressureHiss();
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
      return this.blocksFootprint(x,z,.3,.3) || consoles.blocks(x,z);
    },
    blocksFootprint(x,z,hx,hz) {
      return (Math.abs(x-origin.x)<5.5+hx && z+hz>origin.z-6.4 && z-hz<origin.z+6.4)
        || (Math.abs(x-origin.x)<1.4+hx && z+hz>origin.z+6.3 && z-hz<origin.z+9)
        || machinery.some(b=>x+hx>b.min.x && x-hx<b.max.x && z+hz>b.min.z && z-hz<b.max.z);
    },
    sync(next) { support = syncLifeSupport(support, colony, next); colony = next; air.update(support.air); water.update(support.water); draw(); },
    update(dt, environment, camera, fps) {
      time += dt;
      const clock = environment.unixSeconds;
      sunElevation = environment.sunElevationDeg;
      if (lastClock !== null && clock >= lastClock) support = stepLifeSupport(support, clock-lastClock, sunElevation);
      lastClock = clock;
      this.night = sunElevation < 0;
      const ledOn = Boolean(support.greenhouse?.ledOn);
      if (ledOn !== this.ledOn) { this.ledOn = ledOn; greenhouse.setNight(ledOn); }
      airlockState = cycle ? cycle.awaiting ? 'awaiting-door' : 'cycling' : 'idle';
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
      air.update(support.air); water.update(support.water);
      air.frame(time,dt); water.frame(time,dt); greenhouse.frame(time);
      consoles.update(dt);
      if (time-lastDraw>.25) { draw(); solar?.setPower(lifeSupportTelemetry(support).power); lastDraw=time; }
    },
    reset(next) { support=createLifeSupport(next); colony=next; inside=false; cycle=null; lastClock=null; greenhouse.setAirlock(false,false); draw(); },
    views: {
      power: { position: [-15, 5.5, 67], target: [-23, 1, 60] },
      greenhouse: { position:[origin.x+13,origin.y+8,origin.z+19], target:[origin.x,origin.y+2,origin.z] },
      air: { position:[25,5.5,17], target:[19,1.6,6] },
      water: { position:[55,6.1,-15], target:[62,1.65,-26] },
    },
    dispose() { disposePressureAudio(); consoles.dispose(); greenhouse.dispose(); air.dispose(); water.dispose(); for (const m of [greenhouse,air,water]) m.group.removeFromParent(); },
  };
}
