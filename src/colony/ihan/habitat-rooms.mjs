/**
 * SAMET-HAB — Habitat rooms by Samet, NASAYarismasi/Samet 4c88580.
 * Recovered with rolldown transformSync from MARS-KOLONISI-SAMET.html.
 * Only his console/two displays, three bunks, lab bench/tubes/analyser and
 * controlRoom/bedroom/laboratory/sanitary views are adapted here. The bundled
 * older world, shell, external bathroom extension and navigation are NOT imported.
 * Host rebuild: Samet's separate hygiene module behind the right dome, glovebox, curtains, collision footprints, live rover
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
    sanitary: { name: ROOM_NAMES.sanitary, domeX: 9, waypoint: [9, 0, -4.4],
    position: [9, floorY + 1.65, -3.5], target: [9.2, floorY + .8, -6.4] },
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

  // Samet's Waste & Hygiene module (NASAYarismasi/Samet 4c88580): a separate pressurised compartment
  // behind the right dome (x 9, z -3…-7), entered through the dome's rear opening and a privacy door.
  // Layout as in his build: vacuum toilet, hand-wash unit, shower stall with screen; legs on the regolith.
  const heightAt = world.ground?.userData?.heightAt ?? (() => world.floorY - .5);
  const M = new T.Group(); M.name = 'SanitaryRoom'; M.position.set(9, 0, 0); root.add(M);
  const deck = material({ color: 0x76634e, roughness: .82 });
  box(2.7, .16, 4, deck, 0, -.08, -5, M);                 // floor
  box(2.7, .14, 4, ivory, 0, 2.5, -5, M);                 // ceiling
  for (const x of [-1.3, 1.3]) box(.14, 2.5, 4, ivory, x, 1.25, -5, M);
  box(2.7, 2.5, .14, ivory, 0, 1.25, -6.93, M);           // back wall
  for (const x of [-1.05, 1.05]) box(.5, 2.5, .14, ivory, x, 1.25, -3.07, M);
  box(1.6, .22, .14, ivory, 0, 2.39, -3.07, M);           // lintel over the doorway
  for (const dx of [-1.08, 1.08]) for (const z of [-3.35, -5, -6.65]) {   // support legs to the ground
    const ground = heightAt(9 + dx, z) - world.floorY, h = Math.max(.08, -.16 - ground);
    box(.14, h, .14, steel, dx, ground + h / 2, z, M);
    box(.45, .08, .45, deck, dx, ground + .02, z, M);
  }
  // Vacuum toilet (ISS WHC-style: airflow collection, seat, back panel).
  box(.56, .43, .62, ivory, .65, .25, -5.9, M);
  const seat = mesh(new T.TorusGeometry(.21, .055, 12, 40), steel, .65, .48, -5.86, M); seat.rotation.x = Math.PI / 2;
  box(.52, .64, .2, steel, .65, .65, -6.25, M);
  obstacle(9.65, -6.0, .62, .8);
  // Hand-wash unit.
  box(.6, .1, .45, ivory, .8, .85, -4.2, M);
  mesh(new T.CylinderGeometry(.16, .13, .035, 24), steel, .8, .91, -4.2, M);
  mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(.56,.91,-4.2), new T.Vector3(.56,1.12,-4.2), new T.Vector3(.73,1.14,-4.2), new T.Vector3(.8,1.08,-4.2)]), 20, .018, 8, false), steel, 0, 0, 0, M);
  obstacle(9.8, -4.2, .6, .45);
  // Shower stall: tray, rails, riser, head, drain and a frosted screen.
  box(1.08, .065, 1.45, ivory, -.65, .035, -5.8, M);
  for (const x of [-.52, .52]) box(.035, .055, 1.45, steel, -.65 + x, .085, -5.8, M);
  mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(-.65,.55,-6.45), new T.Vector3(-.65,1.95,-6.45), new T.Vector3(-.65,2.02,-6.1), new T.Vector3(-.65,1.96,-6.02)]), 24, .018, 8, false), steel, 0, 0, 0, M);
  mesh(new T.CylinderGeometry(.13, .13, .035, 24), steel, -.65, 1.93, -6.02, M);
  box(.018, 1.55, 1.1, glass, -.12, .9, -5.9, M);
  obstacle(8.35, -5.8, 1.08, 1.45);
  screen('HİJYEN', 9.65, 1.65, -6.81, .7, .4, ['VAKUM TUVALET', 'ATIK SU HATTI']);
  // Hinged privacy door (Samet: E opens/closes it).
  const door = new T.Group(); door.position.set(-.76, 0, -3.07); M.add(door);
  box(1.5, 2.16, .055, material({ color: 0xc5d4cc, roughness: .78 }), .75, 1.1, 0, door);
  for (const z of [-.06, .06]) box(.05, .22, .065, steel, 1.33, 1.06, z, door);
  let privacyOpen = false;
  const doorBounds = obstacle(9, -3.07, 1.5, .1);  const layout = habitatLayout(world.floorY);
  const views = Object.fromEntries(Object.entries(layout).map(([id, room]) => [id, { position: room.position, target: room.target }]));
  Object.assign(world.views, views);
  root.updateMatrixWorld(true);
  const batching = batchStaticLeaves(root, new Set([door]));
  // Retain every pre-batch buffer for teardown; batchStaticLeaves deliberately doesn't dispose sources.
  root.traverse(part => { if (part.geometry) geometries.add(part.geometry); });
  let elapsed = .5, screenData = mapHabitatTelemetry(), updates = 0;
  function nearPrivacy(x, z) { return Math.abs(x-9)<1.05 && Math.abs(z+3.07)<1.5; }
  return {
    root, layout, views, batching,
    prompt(x,z) { return nearPrivacy(x,z) ? `E · Tuvalet kapısını ${privacyOpen ? 'kapat' : 'aç'}` : ''; },
    interact(x,z) {
      if (!nearPrivacy(x,z)) return false;
      if (privacyOpen && Math.abs(z+3.07)<.3) return false; // don't swing the door through the player
      privacyOpen = !privacyOpen;
      door.rotation.y = privacyOpen ? -Math.PI/2 : 0;
      const i = colliders.indexOf(doorBounds);
      if (privacyOpen && i >= 0) colliders.splice(i, 1); else if (!privacyOpen && i < 0) colliders.push(doorBounds);
      return true;
    },
    update(delta, source) {
      elapsed += Math.max(0,delta);
      if (elapsed < .5-1e-9) return;
      elapsed = 0; // No catch-up uploads after warp; at most two updates per real second.
      screenData = mapHabitatTelemetry(typeof source === 'function' ? source() : source);
      atmosphere(screenData.atmosphere); utilities(screenData.utilities); laboratory(screenData.laboratory); updates++;
    },
    get telemetry() { return { names: ROOM_NAMES, screens: screenData, screenUpdates: updates, privacyClosed: !privacyOpen, batching }; },
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
