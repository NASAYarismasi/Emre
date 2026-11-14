// ROVER: Three.js adapter for the pure rover sim and the existing facility computer panel.
import * as T from 'three'
import { createRoverState, commandRover, stepRover, ROVER_STATIONS, ROVER_INSTRUMENTS,
  ROVER_BATTERY_KWH } from '../../sim/rover.js'

const MODES = { parked: 'Parkta', driving: 'Sürüyor', analyzing: 'Analiz yapıyor', sampling: 'Numune alıyor' }
const number = (v, digits = 1) => v.toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits })
export const roverReadouts = s => [
  ['Mod / hedef', `${MODES[s.mode]} · ${s.target?.name ?? 'Üs parkı'}`],
  ['Konum (X / Z)', `${number(s.x)} / ${number(s.z)} m`],
  ['Hız / odometre', `${number(s.speedMps, 3)} m/sn · ${number(s.odometerM)} m`],
  ['Batarya / MMRTG', `${number(s.batteryKWh, 3)} kWh · %${number(s.batteryKWh / ROVER_BATTERY_KWH * 100, 0)} / 110 W`],
  ['Tüpler / numuneler', `${s.tubesRemaining} / 43 · ${s.samples.length} kaya · 5 tanık ayrıldı`],
  ['İşlem kuyruğu', s.instrumentQueue.join(' → ') || (s.mode === 'sampling' ? 'Karot / mühürleme' : 'Komut bekliyor')],
  ['Son ölçüm', s.measurements.at(-1)?.instrument ?? 'Henüz veri yok'],
]

function labelSprite() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 108
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace
  const material = new T.SpriteMaterial({ map: texture, depthWrite: false, transparent: true, sizeAttenuation: false })
  const sprite = new T.Sprite(material); sprite.scale.set(.32, .045, 1); sprite.renderOrder = 9; sprite.raycast = () => {}
  let previous = ''
  return { sprite, draw(s) {
    const text = `Perseverance · ${MODES[s.mode]}${s.target ? ' → ' + s.target.name : ''}`
    if (previous === text) return
    previous = text
    const g = canvas.getContext('2d'); g.clearRect(0, 0, 768, 108)
    g.fillStyle = 'rgba(6,19,29,.87)'; g.fillRect(0, 0, 768, 108)
    g.fillStyle = '#e7b25c'; g.fillRect(0, 0, 5, 108)
    g.font = '600 29px Barlow, Segoe UI, sans-serif'; g.fillText('MARS 2020  /  BİLİM KEŞFİ', 24, 35)
    g.fillStyle = '#f2ebe0'; g.font = '500 28px Barlow, Segoe UI, sans-serif'; g.fillText(text, 24, 79, 720)
    texture.needsUpdate = true
  }, dispose() { texture.dispose(); material.dispose(); sprite.removeFromParent() } }
}

function trail(scene, heightAt) {
  // GAME ASSUMPTION: shallow wheel imprints and sparse, low dust at the rover's very slow speed.
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 64
  const g = canvas.getContext('2d'); g.fillStyle = '#ffffff'
  for (let y = 0; y < 64; y += 10) { g.fillRect(2, y, 28, 4); g.fillRect(2, y, 3, 8); g.fillRect(27, y, 3, 8) }
  const texture = new T.CanvasTexture(canvas)
  const tracks = new T.InstancedMesh(new T.PlaneGeometry(.32, .62), new T.MeshStandardMaterial({ map: texture, color: 0x594334,
    transparent: true, opacity: .36, depthWrite: false, alphaTest: .02, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), 512)
  tracks.count = 0; tracks.frustumCulled = false; tracks.receiveShadow = true; scene.add(tracks)
  const disc = document.createElement('canvas'); disc.width = disc.height = 64
  const ctx = disc.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.4, '#ffffff88'); gradient.addColorStop(1, '#ffffff00')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64)
  const soft = new T.CanvasTexture(disc), positions = new Float32Array(24 * 3).fill(-100)
  const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.BufferAttribute(positions, 3))
  const dust = new T.Points(geometry, new T.PointsMaterial({ map: soft, color: 0xa98b6b, size: .18, transparent: true, opacity: .17, depthWrite: false }))
  dust.frustumCulled = false; scene.add(dust)
  const pose = new T.Object3D(), ages = new Float32Array(24).fill(10), origins = new Float32Array(24 * 3)
  let index = 0, mote = 0, lastDistance = 0
  return { softTexture: soft, update(dt, s) {
    if (s.odometerM - lastDistance >= .48) {
      lastDistance = s.odometerM
      for (let side = -1; side <= 1; side += 2) {
        const x = s.x + Math.cos(s.heading) * side * 1.04, z = s.z - Math.sin(s.heading) * side * 1.04
        pose.position.set(x, heightAt(x, z) + .012, z); pose.rotation.set(-Math.PI / 2, 0, s.heading); pose.updateMatrix()
        tracks.setMatrixAt(index, pose.matrix); index = (index + 1) % 512; tracks.count = Math.min(512, tracks.count + 1)
        tracks.instanceMatrix.needsUpdate = true
        ages[mote] = 0; origins[mote * 3] = x; origins[mote * 3 + 1] = pose.position.y + .06; origins[mote * 3 + 2] = z
        mote = (mote + 1) % 24
      }
    }
    for (let i = 0; i < 24; i++) {
      ages[i] += dt; positions[i * 3] = origins[i * 3] + ages[i] * .14
      positions[i * 3 + 1] = ages[i] < 1.5 ? origins[i * 3 + 1] + Math.sin(ages[i] * 2) * .06 : -100
      positions[i * 3 + 2] = origins[i * 3 + 2]
    }
    geometry.attributes.position.needsUpdate = true
  }, dispose() { for (const o of [tracks, dust]) { o.removeFromParent(); o.geometry.dispose(); o.material.dispose() }; texture.dispose(); soft.dispose() } }
}

export function createRover({ scene, reference, heightAt, focus }) {
  const state = createRoverState(), label = labelSprite(), tracks = trail(scene, heightAt)
  scene.add(label.sprite)
  const style = document.createElement('style')
  style.textContent = `.rover-controls{display:grid;gap:8px}.rover-controls label{font-size:12px;color:#a9babe}.rover-controls select{width:100%;padding:9px;color:#f2ebe0;background:#0b1f29;border:1px solid #aac7d35c;font:inherit}.rover-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}.rover-actions button{padding:9px;background:#0b1f29;border:1px solid #aac7d34d;color:#eef5f2;font:inherit;font-size:13px;cursor:pointer}.rover-actions button:first-child{border-color:#e7b25c;color:#e7b25c}.rover-actions button:disabled{opacity:.38;cursor:default}.rover-results{border-top:1px solid #aac7d333;margin-top:12px;padding-top:10px}.rover-results h3{font-size:12px;letter-spacing:.08em;color:#e7b25c;margin:8px 0}.rover-results p{font-size:12px;line-height:1.45;margin:7px 0;color:#a9babe}.rover-results ol{padding-left:19px;max-height:210px;overflow:auto}.rover-results li{font-size:12px;line-height:1.45;margin:10px 0;color:#dce9e5}.rover-results b{color:#e7b25c}`
  document.head.append(style)
  const flash = new T.Sprite(new T.SpriteMaterial({ map: tracks.softTexture, color: 0xff8058, transparent: true, opacity: .8, blending: T.AdditiveBlending, depthWrite: false }))
  flash.scale.setScalar(.06); flash.visible = false; scene.add(flash)
  // Four survey markers, two instanced draws. No extra lights or runtime light topology changes.
  const markers = new T.InstancedMesh(new T.RingGeometry(.7, .76, 32), new T.MeshBasicMaterial({ color: 0xc69b61, transparent: true, opacity: .6, side: T.DoubleSide }), ROVER_STATIONS.length)
  const posts = new T.InstancedMesh(new T.CylinderGeometry(.025, .025, .7, 6), new T.MeshStandardMaterial({ color: 0xd0bb90, roughness: .85 }), ROVER_STATIONS.length)
  const pose = new T.Object3D()
  for (let i = 0; i < ROVER_STATIONS.length; i++) {
    const s = ROVER_STATIONS[i], y = heightAt(s.x, s.z)
    pose.position.set(s.x, y + .02, s.z); pose.rotation.set(-Math.PI / 2, 0, 0); pose.updateMatrix(); markers.setMatrixAt(i, pose.matrix)
    pose.position.set(s.x + .9, y + .35, s.z); pose.rotation.set(0, 0, 0); pose.updateMatrix(); posts.setMatrixAt(i, pose.matrix)
  }
  scene.add(markers, posts)
  const routePositions = new Float32Array(128 * 3), routeGeometry = new T.BufferGeometry()
  routeGeometry.setAttribute('position', new T.BufferAttribute(routePositions, 3)); routeGeometry.setDrawRange(0, 0)
  const route = new T.Line(routeGeometry, new T.LineBasicMaterial({ color: 0x80b7aa, transparent: true, opacity: .36, depthWrite: false }))
  route.frustumCulled = false; scene.add(route)
  const mastPoint = new T.Vector3(), headBounds = new T.Box3()
  let mast = null, model = null, realTime = 0, lastEmission = -Infinity, lastResult = '', resultBox = null, controlsBox = null

  function drawRoute() {
    let count = 0
    for (const p of [state, ...state.path]) {
      if (count === 128) break
      routePositions[count * 3] = p.x; routePositions[count * 3 + 1] = heightAt(p.x, p.z) + .07; routePositions[count * 3 + 2] = p.z; count++
    }
    routeGeometry.setDrawRange(0, state.mode === 'driving' ? count : 0); routeGeometry.attributes.position.needsUpdate = true
  }
  function command(action, value) { const accepted = commandRover(state, action, value); drawRoute(); return accepted }
  function renderResults(box) {
    resultBox = box; box.classList.add('rover-results')
    const key = `${state.message}|${state.mode}|${state.measurements.length}|${state.samples.length}`
    if (controlsBox) {
      const busy = state.mode !== 'parked', atSite = ROVER_STATIONS.some(s => Math.hypot(s.x - state.x, s.z - state.z) <= 1)
      controlsBox.querySelector('[data-rover-action="analyze"]').disabled = busy || !atSite
      controlsBox.querySelector('[data-rover-action="sample"]').disabled = busy || !atSite || state.tubesRemaining <= 5
    }
    if (key === lastResult) return
    lastResult = key; box.replaceChildren()
    box.append(Object.assign(document.createElement('p'), { role: 'status', textContent: state.message }))
    box.append(Object.assign(document.createElement('h3'), { textContent: `BİLİM ARŞİVİ · ${state.measurements.length} ÖLÇÜM / ${state.samples.length} NUMUNE` }))
    const list = document.createElement('ol'); list.reversed = true
    for (let i = state.measurements.length - 1; i >= 0; i--) {
      const m = state.measurements[i], li = document.createElement('li'), title = document.createElement('b')
      title.textContent = `${m.instrument} · ${m.stationName}`; li.append(title, document.createElement('br'))
      let summary = m.summary
      if (m.instrument === 'MEDA') summary = `${number(m.values.pressurePa / 100, 2)} hPa · ${number(m.values.airTemperatureK - 273.15)} °C · ${number(m.values.windMps)} m/sn · τ ${number(m.values.dustOpacity, 2)}`
      li.append(document.createTextNode(summary)); list.append(li)
    }
    box.append(list)
    if (state.samples.length) box.append(Object.assign(document.createElement('p'), { textContent: 'Mühürlü tüpler: ' + state.samples.map(s => `#${String(s.tube).padStart(2, '0')} ${s.stationName}`).join(' · ') }))
  }
  const api = {
    get telemetry() { return state },
    command,
    bindModel(root) {
      model = root
      // NASA GLB has a real head hierarchy but its six wheels are one mesh, not separate pivots.
      // Retain the head assembly and use terrain pitch/roll for the rocker-bogie cue.
      const head = root.getObjectByName('head')
      if (head) {
        reference.updateMatrixWorld(true); headBounds.setFromObject(head); headBounds.getCenter(mastPoint); reference.worldToLocal(mastPoint)
        mast = new T.Group(); mast.name = 'Rover_mast_azimuth'; mast.position.copy(mastPoint); reference.add(mast); mast.attach(head)
      }
    },
    renderControls(box, on) {
      controlsBox = box; box.classList.add('rover-controls'); lastResult = ''
      const label = Object.assign(document.createElement('label'), { textContent: 'Bilim istasyonu', htmlFor: 'rover-station' })
      const station = document.createElement('select'); station.id = 'rover-station'
      for (const s of ROVER_STATIONS) station.append(Object.assign(document.createElement('option'), { value: s.id, textContent: `${s.name} · X ${s.x} / Z ${s.z} m` }))
      station.value = ROVER_STATIONS.some(s => s.id === state.target?.id) ? state.target.id : 'delta'
      const instrumentLabel = Object.assign(document.createElement('label'), { textContent: 'Analiz cihazı', htmlFor: 'rover-instrument' })
      const instrument = document.createElement('select'); instrument.id = 'rover-instrument'
      for (const name of ['all', ...ROVER_INSTRUMENTS]) instrument.append(Object.assign(document.createElement('option'), { value: name, textContent: name === 'all' ? 'Tüm cihazlar · 5 ölçüm' : name }))
      const actions = document.createElement('div'); actions.className = 'rover-actions'
      for (const [action, text] of [['drive', 'Sür →'], ['focus', 'Roverı göster'], ['analyze', 'Analiz et'], ['sample', 'Numune al'], ['park', 'Park et'], ['return', 'Üsse dön']]) {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: text }); b.dataset.roverAction = action
        on(b, 'click', () => {
          if (action === 'focus') focus(state.x, state.z)
          else command(action, action === 'drive' ? station.value : instrument.value)
          if (action === 'drive' || action === 'return') focus(state.x, state.z)
          if (resultBox) renderResults(resultBox)
        }); actions.append(b)
      }
      box.append(label, station, instrumentLabel, instrument, actions)
    },
    renderResults,
    update(dt, warp) {
      realTime += dt
      // GAME ASSUMPTION: environment warp (1/10/60) compresses rover mission time, preserving 0.042 m/s SI telemetry.
      let remaining = dt * warp
      while (remaining > 1e-9) { const h = Math.min(.1, remaining); stepRover(state, h); remaining -= h }
      reference.position.set(state.x, heightAt(state.x, state.z), state.z)
      reference.rotation.order = 'YXZ'; reference.rotation.y = state.heading
      const sx = Math.sin(state.heading), sz = Math.cos(state.heading)
      reference.rotation.x = Math.atan2(heightAt(state.x - sx, state.z - sz) - heightAt(state.x + sx, state.z + sz), 2)
      reference.rotation.z = Math.atan2(heightAt(state.x + sz, state.z - sx) - heightAt(state.x - sz, state.z + sx), 2)
      if (mast) {
        const target = state.target, desired = state.mode === 'analyzing' && target ? Math.atan2(target.x + 1 - state.x, target.z + 2 - state.z) - state.heading : 0
        mast.rotation.y += Math.atan2(Math.sin(desired - mast.rotation.y), Math.cos(desired - mast.rotation.y)) * Math.min(1, dt * 2)
      }
      label.sprite.position.set(state.x, reference.position.y + 3.1, state.z); label.sprite.visible = Boolean(model) && reference.visible
      flash.visible = Boolean(model) && reference.visible && state.mode === 'analyzing' && state.instrumentQueue[0] === 'SuperCam' && state.elapsedS % .6 < .06
      if (flash.visible) { if (mast) mast.getWorldPosition(flash.position); else flash.position.set(state.x, reference.position.y + 2, state.z) }
      tracks.update(dt, state)
      if (state.mode !== 'driving') routeGeometry.setDrawRange(0, 0)
      else { routePositions[0] = state.x; routePositions[1] = reference.position.y + .07; routePositions[2] = state.z; routeGeometry.attributes.position.needsUpdate = true }
      if (realTime - lastEmission >= .5) {
        lastEmission = realTime
        window.dispatchEvent(new CustomEvent('rover:state', { detail: structuredClone(state) }))
        label.draw(state)
        drawRoute()
      }
    },
    reset() { Object.assign(state, createRoverState()); drawRoute(); lastResult = '' },
    dispose() {
      label.dispose(); tracks.dispose(); style.remove(); flash.removeFromParent(); flash.material.dispose()
      for (const o of [markers, posts, route]) { o.removeFromParent(); o.geometry.dispose(); o.material.dispose() }
    },
  }
  return api
}
