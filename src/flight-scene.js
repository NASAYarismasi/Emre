import * as THREE from 'three';
import { transferAt } from './flight.js';

export function createFlightScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030812);
  const camera = new THREE.PerspectiveCamera(48, 1, .01, 180);
  const light = new THREE.DirectionalLight(0xffecd0, 3);
  light.position.set(-12, 6, 5);
  scene.add(light, new THREE.HemisphereLight(0xb7d7ff, 0x432f41, 1.25));
  const points = [];
  let seed = 781;
  const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 1600; i++) {
    const y = random() * 2 - 1;
    const a = random() * Math.PI * 2;
    const ring = Math.sqrt(1 - y * y) * 72;
    points.push(Math.cos(a) * ring, y * 72, Math.sin(a) * ring);
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xc7dcff, size: .095 })));

  function globe(radius, colors) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 900; i++) {
      const x = random() * 512;
      const y = random() * 256;
      ctx.fillStyle = colors[1 + i % (colors.length - 1)];
      ctx.globalAlpha = .1 + random() * .25;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + random() * 35, 1 + random() * 10, -.18, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(new THREE.SphereGeometry(radius, 56, 36),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
  }
  const earth = globe(2.65, ['#235a9c','#4d8669','#e4f4ff','#265476']);
  const mars = globe(2.65, ['#a74929','#ef985b','#652a27','#dea17e']);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(.44, 30, 20), new THREE.MeshBasicMaterial({ color: 0xffcb70 }));
  const marker = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const map = new THREE.Group();
  const mapEarth = globe(.24, ['#256aaf','#7ab77e','#d8e8ff']);
  const mapMars = globe(.18, ['#b75529','#ed9c61','#72372c']);
  const scale = 5;
  function path(points, color) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale)));
    map.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })));
  }
  for (const radius of [1, 1.523679]) {
    path(Array.from({length: 161}, (_, i) => {
      const angle = i / 160 * Math.PI * 2;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }), 0x38506d);
  }
  path(Array.from({length: 161}, (_, i) => transferAt(i / 160).ship), 0xaef07a);
  map.add(sun, marker, mapEarth, mapMars);
  const capsule = new THREE.Group();
  const exhaust = new THREE.Mesh(
    new THREE.ConeGeometry(.24, 1.3, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffa14f, transparent: true, opacity: .75,
      blending: THREE.AdditiveBlending, depthWrite: false })
  );
  exhaust.rotation.z = Math.PI;
  exhaust.position.y = -1.2;
  capsule.add(exhaust);
  scene.add(earth, mars, capsule, map);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0xa45d3b }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2.1;
  scene.add(ground);
  const put = (mesh, position) => mesh.position.set(position[0] * scale, .08, position[1] * scale);

  function draw(renderer, stage, progress, overview) {
    const state = transferAt(stage === 'cruise' ? progress : stage === 'orbit' ? 0 : 1);
    map.visible = overview;
    capsule.visible = !overview;
    exhaust.visible = stage === 'descent';
    exhaust.scale.y = .58 + .42 * Math.sqrt(1 - progress);
    earth.visible = !overview && stage === 'orbit';
    mars.visible = !overview && stage === 'entry';
    ground.visible = !overview && ['descent', 'landed'].includes(stage);
    camera.aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    camera.updateProjectionMatrix();
    if (overview) {
      put(marker, state.ship);
      put(mapEarth, state.earth);
      put(mapMars, state.mars);
      camera.position.set(.01, 22, 8);
      camera.lookAt(0, 0, .85);
    } else {
      capsule.position.set(0, stage === 'landed' ? -1.52 : stage === 'descent' ? .5 - 2.02 * progress : 0, 0);
      capsule.rotation.set(stage === 'entry' ? 1.1 : .12, progress * .8, .14 * (1 - progress));
      earth.position.set(-1, -2.2, -2);
      mars.position.set(-.9, -2.15 - progress * 1.1, -3);
      camera.position.set(3.2, 1.65, 4.9);
      camera.lookAt(0, stage === 'landed' ? -1 : -.38, 0);
    }
    renderer.render(scene, camera);
  }
  return { capsule, draw };
}
