import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { createFlightScene } from './flight-scene.js';
import { flight, transferAt } from './flight.js';
import './style.css';

const get = id => document.getElementById(id);
const viewport = get('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewport.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, .04, 1800);
scene.add(camera);
camera.rotation.order = 'YXZ';
const light = new THREE.DirectionalLight(0xfff1de, 3.1);
light.position.set(5, 10, 8);
scene.add(light, new THREE.HemisphereLight(0xe5f6ff, 0x726658, 2.5));
const pad = new THREE.Group();
const rocketRig = new THREE.Group();
const cabin = new THREE.Group();
pad.add(rocketRig);
scene.add(pad, cabin);

function box(parent, dimensions, position, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), new THREE.MeshStandardMaterial({ color }));
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}
box(pad, [1300, 1, 1300], [0, -.6, 0], 0x68796d);
box(pad, [55, 2, 50], [0, 1, 0], 0x343f42);
for (const x of [-26, -18]) {
  for (const z of [-10, -2]) box(pad, [1.4, 77, 1.4], [x, 38.5, z], 0x303e44);
}
for (let y = 8; y < 77; y += 9) box(pad, [10, 1.15, 10], [-22, y, -6], 0x4c5c61);
for (const x of [-14, -7, 0, 7, 14]) box(pad, [1, .05, 12], [x, 2.03, 12], 0xffbc56);

box(cabin, [7, .2, 5], [0, -.19, 0], 0x667a7f);
box(cabin, [7, 3.3, .15], [0, 1.5, -2.5], 0x394d57);
for (const x of [-2, 0, 2]) {
  box(cabin, [1.06, 1.4, .24], [x, 1, -.8], 0x435d69);
  box(cabin, [1.08, .24, .82], [x, .4, -.42], 0x435d69);
  box(cabin, [1.08, .52, .07], [x, 2.35, -2.39], 0x142c36);
}

const launchPanel = box(pad, [.85, 1.25, .55], [0, 2.625, 19], 0x243c40);
const cabinPanel = box(cabin, [.75, 1.05, .36], [0, .435, .65], 0x243c40);
const wrist = box(camera, [.2, .14, .1], [.25, -.21, -.48], 0x293c3a);
box(wrist, [.16, .10, .01], [0, .076, .012], 0x9be980).material.emissive.set(0x5aa63a);
wrist.rotation.x = -.6;
wrist.visible = false;
function indicator(parent, position) {
  const mesh = box(parent, [.58, .27, .025], position, 0xa9ed62);
  mesh.material.emissive.set(0x558f37);
  return mesh;
}
indicator(launchPanel, [0, .34, .29]);
const powerLamp = indicator(cabinPanel, [0, .34, .19]);
box(cabin, [.18, 2.65, 4.8], [-3.5, 1.23, -.1], 0x394d57);
box(cabin, [.18, 2.65, 4.8], [3.5, 1.23, -.1], 0x394d57);
box(cabin, [7, .14, 4.8], [0, 2.5, -.1], 0x34464d);
box(cabin, [7, 2.64, .16], [0, 1.23, 2.36], 0x394d57);
for (const x of [-2.35, 0, 2.35]) {
  box(cabin, [.95, .065, .14], [x, 2.39, .5], 0xaaccaa).material.emissive.set(0x8ecb9e);
}

const phases = {
  launch: { duration: 11, next: 'orbit', title: '01 / DÜNYA’DAN KALKIŞ' },
  orbit: { duration: 8, next: 'cruise', title: '02 / DÜNYA PARK YÖRÜNGESİ' },
  cruise: { duration: 22, next: 'entry', title: '03 / MARS TRANSFERİ' },
  entry: { duration: 7, next: 'descent', title: '04 / MARS’A VARIŞ' },
  descent: { duration: 8, next: 'landed', title: '05 / GÜÇLÜ İNİŞ' }
};
const flightScene = createFlightScene();
let stage = 'ready';
let stageTime = 0;
let view = 'outside';
let paused = false;
const plume = new THREE.Group();
const plumeMaterials = [
  new THREE.MeshBasicMaterial({ color: 0xff602b, transparent: true, opacity: .56, blending: THREE.AdditiveBlending, depthWrite: false }),
  new THREE.MeshBasicMaterial({ color: 0xffe296, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false })
];
for (const x of [-6.9, 0, 6.9]) {
  for (let layer = 0; layer < 2; layer++) {
    const length = layer ? 8 : 20;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(layer ? .95 : 2.15, length, 20, 1, true), plumeMaterials[layer]);
    flame.rotation.z = Math.PI;
    flame.position.set(x, -length / 2, 0);
    plume.add(flame);
  }
}
plume.position.y = 1.8;
plume.visible = false;
rocketRig.add(plume);
const smoke = new THREE.Group();
const smokeGeometry = new THREE.IcosahedronGeometry(1, 1);
const smokeMaterial = new THREE.MeshStandardMaterial({ color: 0xc5c6bb, transparent: true, opacity: .28, depthWrite: false });
for (let i = 0; i < 55; i++) {
  const puff = new THREE.Mesh(smokeGeometry, smokeMaterial);
  puff.userData.angle = i * 2.39996;
  smoke.add(puff);
}
pad.add(smoke);
smoke.visible = false;
const tracking = new THREE.PerspectiveCamera(44, 1, .1, 1800);

function selectView(next) {
  view = next;
  if (document.pointerLockElement && next !== 'inside') document.exitPointerLock();
  document.querySelectorAll('[data-view]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
}

function setStage(next) {
  stage = next;
  stageTime = 0;
  const label = phases[stage]?.title ?? (stage === 'landed' ? '06 / MARS YÜZEYİ' : 'DÜNYA / FIRLATMA RAMPASI');
  get('label').textContent = label;
  get('status').textContent = label;
  get('flight-controls').hidden = stage === 'ready';
  get('pause-btn').hidden = stage === 'landed';
  get('map-btn').disabled = stage === 'launch';
  get('reset-btn').hidden = stage === 'ready';
  if (stage === 'cruise' && view !== 'inside') selectView('map');
  if (stage === 'entry' && view === 'map') selectView('outside');
}

function updateFlight(dt) {
  if (paused) return;
  if (phases[stage]) {
    stageTime += dt;
    if (stageTime >= phases[stage].duration) setStage(phases[stage].next);
  }
  const t = Math.min(1, stageTime / (phases[stage]?.duration ?? 1));
  plume.visible = stage === 'launch';
  smoke.visible = stage === 'launch' && t < .88;
  if (stage === 'launch') {
    rocketRig.position.y = 190 * t ** 2;
    plume.scale.y = 1 + Math.sin(stageTime * 41) * .085;
    smoke.children.forEach((particle, i) => {
      const spread = 1.2 + 25 * t;
      const radius = spread * Math.sqrt(i / smoke.children.length);
      const a = particle.userData.angle;
      particle.position.set(Math.cos(a) * radius, 3 + (i % 9) * .48 + 4 * t, Math.sin(a) * radius);
      particle.scale.setScalar(.55 + (i % 8) * .21 + t * 5);
    });
    tracking.position.set(105, 60 + rocketRig.position.y * .63, 151);
    tracking.lookAt(-7, 43 + rocketRig.position.y, 0);
  }
  const reading = stage === 'launch' ? 'Kalkış profili · görsel zaman sıkıştırması' :
    stage === 'orbit' ? '200 km park yörüngesi · ' + flight.earthOrbitSpeed.toFixed(2) + ' km/s · transfer Δv ' + flight.injection.toFixed(2) + ' km/s' :
    stage === 'cruise' ? 'Gün ' + (t * flight.travelDays).toFixed(0) + ' / ' + flight.travelDays.toFixed(0) + ' · ' + transferAt(t).speed.toFixed(2) + ' km/s (Güneş’e göre)' :
    stage === 'entry' ? '250 km ideal dairesel Mars yörüngesi · yakalama Δv ' + flight.capture.toFixed(2) + ' km/s' :
    stage === 'descent' ? 'Temsili yönlendirilmiş iniş · motorlar açık' : stage === 'landed' ? 'Yüzey teması · motorlar kapalı' : '';
  if (get('telemetry').textContent !== reading) get('telemetry').textContent = reading;
}

function togglePause() {
  paused = !paused;
  get('pause-btn').textContent = paused ? 'Uçuşa devam et' : 'Uçuşu duraklat';
}

function resetFlight() {
  if (paused) togglePause();
  setStage('ready');
  selectView('outside');
}


function fit(model, height) {
  const bounds = new THREE.Box3().setFromObject(model);
  const pivot = new THREE.Group();
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  pivot.add(model);
  pivot.scale.setScalar(height / bounds.getSize(new THREE.Vector3()).y);
  return pivot;
}

let mode = 'ready';
let ready = false;
let elapsed = 0;
let watchOpen = false;
let powerRestored = false;
const held = new Set();
let active = false;
const status = {
  ready: 'Roket kalkışa hazır.',
  launch: 'Roket rampadan ayrılıyor.',
  transfer: 'Üç astronot Mars transferine geçti.'
};
const objective = { ready: 'Kalkışı başlat', launch: 'Kalkışı izle', transfer: 'Kabin verilerini kontrol et' };

function setView(next) {
  mode = next;
  const inside = mode === 'transfer';
  pad.visible = !inside;
  cabin.visible = inside;
  scene.background = new THREE.Color(inside ? 0x101b2a : 0x91aeb8);
  scene.fog = inside ? null : new THREE.Fog(0x91aeb8, 250, 650);
  camera.position.set(...(inside ? [0, 1.53, 2.04] : [0, 3.66, 24.2]));
  camera.rotation.set(inside ? -.15 : -.04, 0, 0);
  powerRestored = false;
  powerLamp.material.emissive.set(0xa82b12);
  rocketRig.position.y = 0;
  get('label').textContent = inside ? 'TRANSFER / MÜRETTEBAT KABİNİ' : 'DÜNYA / FIRLATMA RAMPASI';
  if (mode === 'ready') get('status').textContent = status[mode];
  get('reset-btn').hidden = mode === 'ready';

}

function setWatch(open) {
  watchOpen = open;
  get('watch').hidden = !open;
  get('watch-btn').textContent = open ? 'Kol bilgisayarını kapat' : 'Kol bilgisayarını aç';
  get('watch-btn').setAttribute('aria-expanded', String(open));
  wrist.visible = open;
}

function nearPanel() {
  const panel = mode === 'ready' ? launchPanel : cabinPanel;
  return Math.hypot(camera.position.x - panel.position.x, camera.position.z - panel.position.z) <= (mode === 'ready' ? 2.1 : 1.05);
}

function interact() {
  if (!active || !nearPanel() || (mode === 'transfer' && view !== 'inside')) return;
  if (mode === 'ready') {
    elapsed = 0;
    setView('launch');
    setStage('launch');
    camera.position.set(0, 1.53, 2.04);
    camera.rotation.set(-.15, 0, 0);
    selectView('outside');
  } else if (mode === 'transfer' && !powerRestored) {
    powerRestored = true;
    powerLamp.material.emissive.set(0x558f37);
    get('status').textContent = 'Kabin gücü geri geldi. Görev bilgisayarını kontrol et.';
  }
}

function move(dt) {
  const inside = mode === 'transfer';
  const horizontal = Number(held.has('KeyD')) - Number(held.has('KeyA'));
  const forward = Number(held.has('KeyW')) - Number(held.has('KeyS'));
  const turn = Number(held.has('ArrowLeft')) - Number(held.has('ArrowRight'));
  const pitch = Number(held.has('ArrowUp')) - Number(held.has('ArrowDown'));
  look(turn * dt * 1.7, pitch * dt * 1.35);
  if (!(horizontal || forward)) return;
  const speed = inside ? 2.2 : held.has('ShiftLeft') ? 8 : 4.5;
  const distance = speed * dt / Math.hypot(horizontal, forward);
  const yaw = camera.rotation.y;
  const x = camera.position.x + (Math.cos(yaw) * horizontal - Math.sin(yaw) * forward) * distance;
  const z = camera.position.z + (-Math.sin(yaw) * horizontal - Math.cos(yaw) * forward) * distance;
  const blockers = inside
    ? [{ x: 0, z: .65, width: .6, depth: .4 }]
    : [{ x: 0, z: 0, width: 10, depth: 10 }, { x: 0, z: 19, width: .68, depth: .52 }];
  const collides = (nx, nz) => blockers.some(obstacle =>
    Math.abs(nx - obstacle.x) < obstacle.width && Math.abs(nz - obstacle.z) < obstacle.depth);
  const nextX = THREE.MathUtils.clamp(x, inside ? -3.15 : -16, inside ? 3.15 : 16);
  const nextZ = THREE.MathUtils.clamp(z, inside ? .38 : 11, inside ? 2.07 : 24.6);
  if (!collides(nextX, camera.position.z)) camera.position.x = nextX;
  if (!collides(camera.position.x, nextZ)) camera.position.z = nextZ;
}

function look(yaw, pitch) {
  camera.rotation.y += yaw;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x + pitch, -1.25, 1.25);
}

function update(dt) {
  if (mode !== 'ready' && !paused) elapsed += dt;
  if (mode === 'launch' && stage === 'orbit') {
    setView('transfer');
    get('label').textContent = phases.orbit.title;
  } else if (active && (mode === 'ready' || (mode === 'transfer' && view === 'inside'))) {
    move(dt);
  }
  updateFlight(dt);
  const seconds = Math.floor(elapsed);
  get('mission-time').textContent = 'T+ ' + String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  get('objective').textContent = missionObjective();
  const hint = !active || (stage !== 'ready' && view !== 'inside') ? '' :
    mode === 'ready' ? (nearPanel() ? 'E · Kalkışı başlat' : 'W · Yeşil kalkış paneline yaklaş') :
    powerRestored ? 'Q · Görev bilgisayarını kontrol et' :
    nearPanel() ? 'E · Kabin gücünü geri getir' : 'Kırmızı güç paneline yaklaş';
  if (get('prompt').textContent !== hint) get('prompt').textContent = hint;
}

function missionObjective() {
  if (stage === 'landed') return 'Mars yüzeyine ulaşıldı';
  if (mode === 'transfer') return powerRestored ? 'Kabin gücü aktif' : 'Kabin gücünü geri getir';
  return objective[mode];
}

get('start-btn').onclick = () => {
  active = true;
  get('intro').hidden = true;
  renderer.domElement.focus();
};
get('reset-btn').onclick = () => {
  elapsed = 0;
  held.clear();
  setWatch(false);
  resetFlight();
  setView('ready');
  renderer.domElement.focus();
};
document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => selectView(button.dataset.view);
});
get('pause-btn').onclick = togglePause;
get('watch-btn').onclick = () => setWatch(!watchOpen);
renderer.domElement.tabIndex = 0;
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft']);
window.addEventListener('keydown', event => {
  if (!active || event.ctrlKey || event.metaKey || event.altKey) return;
  if (movementKeys.has(event.code)) {
    event.preventDefault();
    held.add(event.code);
  }
  if (event.repeat) return;
  if (event.code === 'KeyE') interact();
  if (stage !== 'ready') {
    if (event.code === 'Digit1') selectView('outside');
    if (event.code === 'Digit2') selectView('inside');
    if (event.code === 'Digit3' && stage !== 'launch') selectView('map');
    if (event.code === 'KeyP' && stage !== 'landed') togglePause();
  }
  if (event.code === 'KeyQ') setWatch(!watchOpen);
  if (event.code === 'Escape') held.clear();
  if (event.code === 'KeyF') {
    const task = document.fullscreenElement ? document.exitFullscreen() : document.querySelector('main').requestFullscreen();
    task.catch(() => {});
  }
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => held.clear());
const canvas = renderer.domElement;
canvas.addEventListener('click', () => {
  if (!active || document.pointerLockElement === canvas) return;
  try {
    canvas.requestPointerLock?.()?.catch(() => {});
  } catch {
    // Drag and arrow keys remain available in embedded browsers.
  }
});
canvas.addEventListener('pointermove', event => {
  if (!active || (stage !== 'ready' && view !== 'inside')) return;
  if (document.pointerLockElement === canvas || event.buttons === 1) {
    look(-event.movementX * .003, -event.movementY * .003);
  }
});
new ResizeObserver(() => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
}).observe(viewport);
setView('ready');
get('status').textContent = 'NASA modelleri yükleniyor…';
const draco = new DRACOLoader().setDecoderPath(import.meta.env.BASE_URL + 'draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const asset = name => loader.loadAsync(import.meta.env.BASE_URL + 'assets/' + name + '.glb');
Promise.all([asset('sls'), asset('orion'), asset('astronaut')]).then(([sls, orion, astronaut]) => {
  const rocket = fit(sls.scene, 98);
  rocket.position.y = 51;
  rocketRig.add(rocket);
  flightScene.capsule.add(fit(orion.scene.clone(), 1.2));
  const capsule = fit(orion.scene, .48);
  capsule.position.set(2.85, 1.02, .12);
  box(cabin, [.68, .08, .62], [2.85, .72, .12], 0x435d69);
  capsule.rotation.x = -.65;
  cabin.add(capsule);
  for (const x of [-2, 0, 2]) {
    const person = fit(astronaut.scene.clone(), 1.7);
    person.position.set(x, 1.13, .14);
    cabin.add(person);
  }
  ready = true;
  get('start-btn').disabled = false;
  get('watch-btn').disabled = false;
  setView('ready');
}).catch(error => {
  get('status').textContent = 'Model yüklenemedi. Sayfayı yenileyip tekrar dene.';
  console.error(error);
});

let previous = performance.now();
let manualTime = false;
function render() {

  const inside = stage !== 'ready' && view === 'inside';
  get('crosshair').hidden = stage !== 'ready' && !inside;
  if (stage === 'ready') {
    renderer.render(scene, camera);
  } else if (inside) {
    pad.visible = false;
    cabin.visible = true;
    scene.background.setHex(0x101b2a);
    scene.fog = null;
    renderer.render(scene, camera);
  } else if (stage === 'launch') {
    pad.visible = true;
    cabin.visible = false;
    scene.background.setHex(0x91aeb8);
    tracking.aspect = camera.aspect;
    tracking.updateProjectionMatrix();
    renderer.render(scene, tracking);
  } else {
    flightScene.draw(renderer, stage, stageTime / (phases[stage]?.duration ?? 1), view === 'map');
  }
}
renderer.setAnimationLoop(now => {
  if (!manualTime) update(Math.min((now - previous) / 1000, .05));
  previous = now;
  render();
});
window.advanceTime = ms => {
  manualTime = true;
  for (let left = ms / 1000; left > 0; left -= 1 / 60) update(Math.min(left, 1 / 60));
  render();
};
window.render_game_to_text = () => JSON.stringify({
  mode, stage, stageTime, view, paused, ready, elapsedSeconds: Math.floor(elapsed), crew: 3, watchOpen,
  objective: missionObjective(), active, powerRestored, nearPanel: nearPanel(),
  position: { x: camera.position.x, z: camera.position.z }, rocketHeightMeters: Math.round(rocketRig.position.y),
  coordinates: 'Metre, Y yukarı'
});