/**
 * SAMET-HAB — Habitat rooms by Samet, NASAYarismasi/Samet 4c88580.
 * Recovered with rolldown transformSync from MARS-KOLONISI-SAMET.html.
 * Only his console/two displays, three bunks, lab bench/tubes/analyser and
 * controlRoom/bedroom/laboratory/sanitary views are adapted here. The bundled
 * older world, shell, external bathroom extension and navigation are NOT imported.
 * Host rebuild: in-dome WHC, glovebox, curtains, collision footprints, live rover
 * science, batched geometry and resource ownership. All dimensions: GAME ASSUMPTION.
 * WHC design reference (airflow collection, separate hose and waste container):
 * https://www.nasa.gov/general/morning-routine-in-space/
 * This is a Mars concept interior, not a dimensionally accurate ISS replica.
 */
import * as T from 'three';
import { batchStaticLeaves } from '../scene/static-model.mjs';

export const HABITAT_CLEARANCE = .22; // GAME ASSUMPTION: suited body radius.
export const ROOM_NAMES = Object.freeze({ controlRoom: 'Ana oda', bedroom: 'Yatak odası', laboratory: 'Laboratuvar', sanitary: 'Tuvalet' });

/** Shared scene/test layout. Coordinates are metres relative to ova.floorY. */
export function habitatLayout(floorY) {
  return {
    controlRoom: { name: ROOM_NAMES.controlRoom, domeX: 0, waypoint: [0, 0, -.9],
      position: [0, floorY + 1.7, 1.9], target: [0, floorY + 1.37, -2.05] },
    bedroom: { name: ROOM_NAMES.bedroom, domeX: 9, waypoint: [9, 0, .15],
      position: [7.1, floorY + 1.85, -.45], target: [9.3, floorY + .63, 1.55] },
    laboratory: { name: ROOM_NAMES.laboratory, domeX: -9, waypoint: [-9, 0, -.85],
      position: [-9, floorY + 1.7, 1.9], target: [-9, floorY + 1.23, -1.95] },
    sanitary: { name: ROOM_NAMES.sanitary, domeX: 9, waypoint: [9, 0, -1.6],
      position: [9, floorY + 1.65, -.45], target: [9.1, floorY + .85, -2.12] },
  };
}

/** Read the SAME observer objects as render_game_to_text; never change sim state.
 * Missing measurements stay explicitly unavailable, rather than inventing readings.
 */
export function mapHabitatTelemetry({ lifeSupport = {}, colonyPower, rover = {} } = {}) {
  const number = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const power = colonyPower ?? lifeSupport.power ?? {};
  const measurements = rover.measurements ?? [], samples = rover.samples ?? [];
  const latest = measurements.at(-1), sample = samples.at(-1);
  return {
    atmosphere: [`O₂  ${number(lifeSupport.oxygenKg, 2)} kg`, `CO₂ temizlenen  ${number(lifeSupport.air?.removedCO2Kg, 2)} kg`],
    utilities: [`Su  ${number(lifeSupport.waterL)} L`, `Güç  ${number(lifeSupport.powerKW, 2)} kW`,
      `Batarya  ${number(power.batteryKWh)} kWh`, `Güneş  ${number(power.solarKW, 2)} kW`],
    laboratory: [latest ? `${latest.instrument} · ${latest.stationName ?? latest.stationId ?? 'İstasyon'}` : 'Rover ölçümü bekleniyor',
      latest?.summary || 'Henüz ölçüm verisi yok',
      `Ölçüm: ${measurements.length} · Numune: ${samples.length}`,
      sample ? `Tüp ${sample.tube} · ${sample.stationName ?? sample.stationId ?? 'İstasyon'} · ${sample.sealed ? 'mühürlü' : 'açık'}` : 'Mühürlü numune yok',
      latest?.simulated ? 'Simülasyon ölçümü' : 'Rover bilim kaydı'],
  };
}

/** Install before host batching: remove only the old, measured furniture leaves.
 * No reliance on child indices, shell materials or the other worker's layout.
 */
function replaceOriginalFurniture(world) {
  const retired = [], bounds = new T.Box3();
  world.habitat.updateMatrixWorld(true);
  world.habitat.traverse(part => {
    if (!part.isMesh || part.children.length) return;
    bounds.setFromObject(part);
    if (world.indoorObstacles.some(box => box.min.distanceTo(bounds.min) < 1e-5 && box.max.distanceTo(bounds.max) < 1e-5)) retired.push(part);
  });
  retired.forEach(part => part.removeFromParent());
  world.indoorObstacles.length = 0;
  return retired;
}

export function createHabitatRooms(world) {
  const retired = replaceOriginalFurniture(world);
  const root = new T.Group(); root.name = 'Samet_habitat_rooms';
  root.position.y = world.floorY;
  world.habitat.add(root);
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const material = options => { const m = new T.MeshStandardMaterial(options); materials.add(m); return m; };
  // Match İhan's warm ivory, olive cloth and brushed grey equipment palette.
  const ivory = material({ color: 0xcac2b1, roughness: .86 });
  const steel = material({ color: 0x666e70, roughness: .49, metalness: .36 });
  const dark = material({ color: 0x283a40, roughness: .64, metalness: .2 });
  const fabric = material({ color: 0x87948f, roughness: 1 });
  const bedding = material({ color: 0xb5a38b, roughness: 1 });
  const amber = material({ color: 0xd1a25c, roughness: .7 });
  const glass = material({ color: 0x97bdc4, transparent: true, opacity: .22, roughness: .18, depthWrite: false });
  const mesh = (geometry, mat, x, y, z, parent = root) => {
    geometries.add(geometry);
    const part = new T.Mesh(geometry, mat); part.position.set(x, y, z);
    part.receiveShadow = true; // Reuse existing illumination; no new lights/shadow passes.
    parent.add(part); return part;
  };
  const box = (w, h, d, mat, x, y, z, parent) => mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const cylinder = (r, h, mat, x, y, z) => mesh(new T.CylinderGeometry(r, r, h, 16), mat, x, y, z);
  const colliders = world.indoorObstacles;
  function obstacle(x, z, w, d) {
    const bounds = new T.Box3(new T.Vector3(x-w/2, world.floorY, z-d/2), new T.Vector3(x+w/2, world.floorY+2.1, z+d/2));
    colliders.push(bounds); return bounds;
  }

  const displays = [];
  function screen(title, x, y, z, w, h, lines = []) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 640;
    const ctx = canvas.getContext('2d'), texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace; textures.add(texture);
    const mat = new T.MeshBasicMaterial({ map: texture, toneMapped: false }); materials.add(mat);
    box(w+.09, h+.09, .07, dark, x, y, z);
    mesh(new T.PlaneGeometry(w, h), mat, x, y, z+.039);
    let signature;
    const draw = values => {
      if (JSON.stringify(values) === signature) return;
      signature = JSON.stringify(values);
      ctx.fillStyle = '#081c24'; ctx.fillRect(0, 0, 1024, 640);
      ctx.fillStyle = '#68d6c2'; ctx.font = 'bold 48px sans-serif'; ctx.fillText(title, 40, 75);
      ctx.fillStyle = '#d7e7e5'; ctx.font = '36px sans-serif';
      let row = 0;
      for (const line of values) {
        let text = '';
        for (const word of String(line).split(' ')) {
          if (ctx.measureText(text + word).width > 940 && text) { ctx.fillText(text, 40, 148+row++*55); text = ''; }
          text += word + ' ';
        }
        if (row < 9) ctx.fillText(text, 40, 148+row++*55);
      }
      texture.needsUpdate = true;
    };
    draw(lines); displays.push(draw); return draw;
  }

  // Samet's central console and two life-support displays, fitted over a service rack.
  box(2.72, .84, .66, ivory, 0, .42, -2.1);
  box(2.82, .07, .82, steel, 0, .88, -2.04);
  obstacle(0, -2.1, 2.82, .82);
  for (const x of [-.85, 0, .85]) {
    box(.76, .52, .026, dark, x, .42, -1.755);
    for (let i=0; i<5; i++) box(.62, .018, .028, steel, x, .25+i*.07, -1.735);
  }
  const atmosphere = screen('ATMOSFER', -.73, 1.48, -2.17, 1.25, .78);
  const utilities = screen('SU / ENERJİ', .73, 1.48, -2.17, 1.25, .78);
  for (let i=0; i<7; i++) box(.12, .025, .10, i%2 ? amber : dark, -.95+i*.31, .93, -1.8);
  box(.52, .025, .18, dark, -.38, .94, -1.79);

  // Samet's three horizontal bunks: padded mattresses, restrained bags and gathered curtains.
  for (const [index, dx] of [-1.04, 0, 1.04].entries()) {
    const x = 9+dx, z = 1.5;
    box(.88, .32, 1.84, steel, x, .25, z);
    box(.82, .13, 1.78, ivory, x, .475, z);
    box(.71, .13, 1.25, fabric, x, .59, z-.14);
    box(.61, .12, .34, bedding, x, .61, z+.64);
    box(.025, .015, 1.16, amber, x, .665, z-.14); // bag zipper
    for (const dz of [-.48, .25]) box(.72, .025, .06, dark, x, .67, z+dz);
    for (const side of [-1, 1]) {
      box(.025, 1.48, .025, steel, x+side*.445, 1.0, z-.88);
      box(.025, .025, 1.78, steel, x+side*.445, 1.72, z);
      for (let fold=0; fold<5; fold++) box(.017, 1.0, .065, fabric, x+side*.445, 1.19, z+.52+fold*.065);
    }
    obstacle(x, z, .9, 1.88);
    // Personal locker at the foot, no objects placed across the tunnel centreline.
    box(.72, .22, .035, dark, x, .24, z-.94);
    box(.13, .026, .035, amber, x, .26, z-.965);
    screen(`EKİP ${index+1}`, x, .31, z-.969, .32, .1, []);
  }
  for (const x of [6.9, 11.1]) {
    box(.5, 1.45, .48, ivory, x, .725, -1.1);
    box(.43, 1.3, .025, steel, x, .72, -.85);
    box(.035, .24, .035, amber, x+.11, .8, -.82);
    obstacle(x, -1.1, .5, .48);
  }

  // Samet's lab bench/analyser/tubes; add a sealed glovebox with two glove ports.
  box(2.75, .12, .86, ivory, -9, .94, -1.98);
  for (const x of [-10.12, -7.88]) box(.12, .87, .65, steel, x, .45, -1.98);
  obstacle(-9, -1.98, 2.75, .86);
  const laboratory = screen('NUMUNE ANALİZİ', -9.72, 1.48, -2.19, 1.2, .79);
  box(.82, .06, .62, steel, -8.22, 1.04, -1.98);
  box(.82, .53, .62, glass, -8.22, 1.33, -1.98);
  box(.82, .045, .62, ivory, -8.22, 1.62, -1.98);
  for (const dx of [-.19, .19]) {
    mesh(new T.TorusGeometry(.102, .023, 8, 24), dark, -8.22+dx, 1.3, -1.65);
    const glove = mesh(new T.SphereGeometry(.09, 12, 8), fabric, -8.22+dx, 1.28, -1.84);
    glove.scale.set(.8, .7, 1.5);
  }
  box(.46, .2, .38, steel, -8.2, 1.18, -2.0); // sealed analyser inside glovebox
  for (let i=0; i<6; i++) {
    cylinder(.023, .17, glass, -9.55+i*.12, 1.09, -1.68);
    cylinder(.027, .027, amber, -9.55+i*.12, 1.19, -1.68);
  }
  box(.8, .045, .14, dark, -9.25, 1.01, -1.68);

  // In-dome Waste & Hygiene Compartment. Side panels leave a 1.04 m entry.
  for (const x of [8.22, 9.78]) {
    box(.08, 1.95, 1.64, ivory, x, .975, -1.92);
    obstacle(x, -1.92, .08, 1.64);
  }
  box(1.64, 1.95, .08, ivory, 9, .975, -2.74);
  obstacle(9, -2.74, 1.64, .08);
  box(1.64, .09, 1.65, ivory, 9, 1.995, -1.92);
  for (const x of [8.37, 9.63]) {
    box(.26, 1.95, .07, steel, x, .975, -1.08);
    obstacle(x, -1.08, .26, .07);
  }
  box(.5, .46, .53, ivory, 9.29, .25, -2.3);
  cylinder(.21, .10, ivory, 9.29, .51, -2.28);
  const seat = mesh(new T.TorusGeometry(.145, .046, 10, 28), dark, 9.29, .585, -2.28); seat.rotation.x = -Math.PI/2;
  box(.5, .67, .12, steel, 9.29, .56, -2.59);
  for (const dx of [-.2, .2]) box(.06, .04, .22, dark, 9.29+dx, .12, -1.95);
  obstacle(9.29, -2.34, .53, .61);
  const hose = new T.CatmullRomCurve3([new T.Vector3(9.6,.25,-2.5),new T.Vector3(9.65,.9,-2.36),new T.Vector3(9.49,1.13,-2.2)]);
  mesh(new T.TubeGeometry(hose, 16, .025, 8, false), dark, 0, 0, 0);
  mesh(new T.ConeGeometry(.075, .13, 16), amber, 9.49, 1.17, -2.2);
  box(.38, .48, .24, ivory, 8.46, .89, -2.38); // wipe/water dispenser, no shower
  box(.22, .07, .03, dark, 8.46, .93, -2.24);
  box(.34, .03, .23, steel, 8.47, .59, -2.33);
  screen('HİJYEN · WHC', 8.96, 1.57, -2.689, .75, .32, ['Fanlı atık toplama', 'Su geri kazanım hattı']);

  // Sliding privacy curtain: opening never swings into a walking corridor.
  const curtain = new T.Group(); root.add(curtain);
  for (let i=0; i<14; i++) box(.073, 1.79, .04, fabric, 8.51+i*.075, .92, -1.073+(i%2)*.015, curtain);
  let privacyClosed = false;
  curtain.scale.x = .12; curtain.position.x = 8.51*(1-.12);
  const doorBounds = new T.Box3(new T.Vector3(8.48,world.floorY,-1.13),new T.Vector3(9.52,world.floorY+1.85,-1.01));
  const layout = habitatLayout(world.floorY);
  const views = Object.fromEntries(Object.entries(layout).map(([id, room]) => [id, { position: room.position, target: room.target }]));
  Object.assign(world.views, views);
  root.updateMatrixWorld(true);
  const batching = batchStaticLeaves(root, new Set([curtain]));
  batchStaticLeaves(curtain);
  // Retain every pre-batch buffer for teardown; batchStaticLeaves deliberately doesn't dispose sources.
  root.traverse(part => { if (part.geometry) geometries.add(part.geometry); });
  let elapsed = .5, screenData = mapHabitatTelemetry(), updates = 0;
  function nearPrivacy(x, z) { return Math.abs(x-9)<.68 && Math.abs(z+1.08)<.85; }
  return {
    root, layout, views, batching,
    prompt(x,z) { return nearPrivacy(x,z) ? `E · Tuvalet perdesini ${privacyClosed ? 'aç' : 'kapat'}` : ''; },
    interact(x,z) {
      if (!nearPrivacy(x,z)) return false;
      // Don't close the curtain through the player's body.
      if (!privacyClosed && Math.abs(z+1.07)<.32) return false;
      privacyClosed = !privacyClosed;
      curtain.scale.x = privacyClosed ? 1 : .12; curtain.position.x = 8.51*(1-curtain.scale.x);
      if (privacyClosed) colliders.push(doorBounds);
      else { const i=colliders.indexOf(doorBounds); if (i>=0) colliders.splice(i,1); }
      return true;
    },
    update(delta, source) {
      elapsed += Math.max(0,delta);
      if (elapsed < .5-1e-9) return;
      elapsed = 0; // No catch-up uploads after warp; at most two updates per real second.
      screenData = mapHabitatTelemetry(typeof source === 'function' ? source() : source);
      atmosphere(screenData.atmosphere); utilities(screenData.utilities); laboratory(screenData.laboratory); updates++;
    },
    get telemetry() { return { names: ROOM_NAMES, screens: screenData, screenUpdates: updates, privacyClosed, batching }; },
    dispose() {
      root.removeFromParent();
      for (const part of retired) {
        geometries.add(part.geometry);
        for (const mat of [part.material].flat()) materials.add(mat);
      }
      for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
      colliders.length = 0;
    },
  };
}
