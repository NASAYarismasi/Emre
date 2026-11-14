/** Perseverance surface operations. Pure, deterministic; distances/time in SI.
 * batteryKWh is the requested dashboard interchange unit (energy integration uses watts/seconds).
 */
// NASA/JPL: 152 m/h on hard flat ground, rounded down to 0.042 m/s.
// https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/
export const ROVER_MAX_SPEED_MPS = .042
// NASA/JPL: initial MMRTG output ~110 W; two 43 Ah batteries.
// https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/mission/spacecraft/power/
export const ROVER_GENERATOR_W = 110
export const ROVER_BATTERY_AH = 2 * 43
// GAME ASSUMPTION: 28 V nominal conversion, usable full capacity, constant loads and turn rate.
export const ROVER_BATTERY_KWH = ROVER_BATTERY_AH * 28 / 1000
export const ROVER_LOAD_W = { parked: 80, driving: 230, analyzing: 180, sampling: 300 }
export const ROVER_TURN_RAD_S = .12
// NASA: 43 total tubes, including 5 witness tubes; reserve witnesses, only 38 can hold rock.
// https://www.jpl.nasa.gov/news/press_kits/mars_2020/launch/quick_facts/
export const ROVER_TUBES = 43
export const ROVER_WITNESS_TUBES = 5
export const ROVER_INSTRUMENTS = ['SuperCam', 'PIXL', 'SHERLOC', 'MEDA', 'RIMFAX']
// GAME ASSUMPTION: compact teaching sites, not surveyed Jezero locations; all synthetic values below.
export const ROVER_HOME = { id: 'base', name: 'Üs parkı', x: 5.75, z: 14.5 }
export const ROVER_STATIONS = [
  { id: 'seitah', name: 'Séítah · olivin', x: -26, z: 24, mineral: 'Olivin + piroksen; zayıf karbonat', elements: [17, 18, 20, 4, .4] },
  { id: 'delta', name: 'Delta önü', x: 33, z: 30, mineral: 'Karbonat + silikat; suyla değişim izi', elements: [10, 7, 24, 12, 1.8] },
  { id: 'salts', name: 'Tuzlu regolit', x: 45, z: 12, mineral: 'Sülfatlı regolit; perklorat adayı (kesin tanı değil)', elements: [14, 6, 22, 7, 4.6] },
  { id: 'layers', name: 'Delta katmanları', x: 42, z: -38, mineral: 'İnce taneli silikat + karbonat', elements: [12, 9, 25, 8, 1.1] },
]
// GAME ASSUMPTION: crew keep-outs enlarged for rover footprint; centre dome + tunnels, lander, facilities.
export const ROVER_OBSTACLES = [[0, 0, 15.3], [-18, -12, 8], [19, 26, 11.3], [19, 6, 4.6], [64, -26, 4.8]]
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z)
export function roverSegmentClear(a, b, obstacles = ROVER_OBSTACLES) {
  const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz
  return obstacles.every(([x, z, r]) => {
    const t = d2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / d2)) : 0
    return Math.hypot(a.x + t * dx - x, a.z + t * dz - z) >= r - 1e-8
  })
}
/** Visibility graph around keep-out circles. Generated only when receiving a drive command. */
export function planRoverPath(a, b, obstacles = ROVER_OBSTACLES) {
  if (!roverSegmentClear(a, a, obstacles) || !roverSegmentClear(b, b, obstacles)) return []
  if (roverSegmentClear(a, b, obstacles)) return [{ x: b.x, z: b.z }]
  const nodes = [{ x: a.x, z: a.z }, { x: b.x, z: b.z }]
  // GAME ASSUMPTION: 24 navigation vertices per circle, .6 m extra clearance.
  for (const [x, z, r] of obstacles) for (let i = 0; i < 24; i++) {
    const p = { x: x + (r + .6) * Math.cos(i * Math.PI / 12), z: z + (r + .6) * Math.sin(i * Math.PI / 12) }
    if (roverSegmentClear(p, p, obstacles)) nodes.push(p)
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set()
  costs[0] = 0
  while (visited.size < nodes.length) {
    let best = -1
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (best < 0 || costs[i] < costs[best])) best = i
    if (best < 0 || !Number.isFinite(costs[best])) break
    if (best === 1) {
      const path = []; for (let i = 1; i !== 0; i = previous[i]) path.unshift(nodes[i])
      return path
    }
    visited.add(best)
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && roverSegmentClear(nodes[best], nodes[i], obstacles)) {
      const cost = costs[best] + distance(nodes[best], nodes[i])
      if (cost < costs[i]) { costs[i] = cost; previous[i] = best }
    }
  }
  return [] // Never fall back to a straight line through hardware.
}

export function createRoverState(seed = 2026) {
  return { x: ROVER_HOME.x, z: ROVER_HOME.z, heading: -.6, speedMps: 0, odometerM: 0,
    mode: 'parked', target: null, batteryKWh: ROVER_BATTERY_KWH, instrumentQueue: [],
    samples: [], measurements: [], tubesRemaining: ROVER_TUBES, witnessTubes: ROVER_WITNESS_TUBES,
    path: [], elapsedS: 0, operationRemainingS: 0, seed: seed >>> 0, message: 'Rover komut bekliyor.' }
}
const stationAt = state => ROVER_STATIONS.find(s => distance(state, s) <= 1)
/** Commands mutate this isolated sim state. Returns false with a Turkish reason if rejected. */
export function commandRover(state, command, value) {
  const reject = message => { state.message = message; return false }
  if (command === 'park') {
    state.mode = 'parked'; state.speedMps = 0; state.path.length = 0; state.instrumentQueue.length = 0
    state.operationRemainingS = 0; state.message = 'Rover park edildi.'; return true
  }
  if (command === 'drive' || command === 'return') {
    const target = command === 'return' ? ROVER_HOME : ROVER_STATIONS.find(s => s.id === value)
    if (!target) return reject('Geçerli bir bilim istasyonu seç.')
    const path = planRoverPath(state, target)
    if (!path.length) return reject('Güvenli rota bulunamadı.')
    state.target = { id: target.id, name: target.name, x: target.x, z: target.z }; state.path = path
    state.instrumentQueue.length = 0; state.mode = 'driving'; state.speedMps = 0
    state.message = `${target.name} için güvenli rota hazır.`; return true
  }
  if (state.mode !== 'parked') return reject('Önce sürüşün veya işlemin bitmesini bekle / Park et.')
  if (!stationAt(state)) return reject('Analiz ve numune için bilim istasyonuna sür.')
  if (state.batteryKWh < .05) return reject('Batarya düşük; MMRTG şarjını bekle.') // GAME ASSUMPTION: reserve.
  if (command === 'analyze') {
    const instruments = value === 'all' ? ROVER_INSTRUMENTS : [value]
    if (instruments.some(i => !ROVER_INSTRUMENTS.includes(i))) return reject('Bilinmeyen cihaz.')
    state.instrumentQueue = [...instruments]; state.mode = 'analyzing'
    state.operationRemainingS = 24 // GAME ASSUMPTION: compressed instrument acquisition time.
    state.message = 'Bilim cihazları veri topluyor.'; return true
  }
  if (command === 'sample') {
    if (state.samples.length >= ROVER_TUBES - ROVER_WITNESS_TUBES) return reject('Kaya tüpleri dolu; 5 tanık tüpü ayrıldı.')
    state.mode = 'sampling'; state.operationRemainingS = 45 // GAME ASSUMPTION: compressed coring/sealing time.
    state.message = 'Karot alınıyor ve tüp mühürleniyor.'; return true
  }
  return reject('Bilinmeyen rover komutu.')
}
function random(state) { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296 }
const round = v => Math.round(v * 100) / 100
/** Synthetic teaching observations, informed by Mars 2020 publications, never live/archival instrument data.
 * Olivine/carbonate/sulfate context: https://ntrs.nasa.gov/citations/20220003568
 * Jezero salts & subsurface: https://ntrs.nasa.gov/api/citations/20230016431/downloads/Sun%20et%20al%202023%20JGR%20Planets%20Jezero%20Campaign.pdf
 * SHERLOC fluorescence is not uniquely organic: https://doi.org/10.1126/sciadv.adm8241
 * MEDA suite: https://science.nasa.gov/resource/meda-is-ready-weather-or-not/
 */
function measure(state, instrument, site) {
  const r = random(state), result = { id: state.measurements.length + 1, instrument, stationId: site.id,
    stationName: site.name, elapsedS: state.elapsedS, simulated: true, values: {}, summary: '' }
  // GAME ASSUMPTION: all abundances, weather, depths, spectral peak selection and organic candidates.
  if (instrument === 'SuperCam') {
    result.values = { ramanPeaksPerCm: site.id === 'seitah' ? [825, 850, 1085] : site.id === 'salts' ? [1010, 1085] : [1085, 1090] }
    result.summary = `LIBS/Raman: ${site.mineral}.`
  } else if (instrument === 'PIXL') {
    const elements = ['Fe', 'Mg', 'Si', 'Ca', 'S']
    elements.forEach((e, i) => { result.values[e] = round(site.elements[i] * (.96 + random(state) * .08)) })
    result.values.unit = 'wt%'; result.summary = elements.map(e => `${e} ${result.values[e]}%`).join(' · ') + ' (kalan: O ve diğerleri)'
  } else if (instrument === 'SHERLOC') {
    result.values = { organicsCandidate: r > .4, confirmedLife: false }
    result.summary = r > .4 ? 'Floresans adayı; organik köken doğrulanmadı. Yaşam kanıtı değildir.' : 'Organik aday sinyali eşik altında; mineral floresansı baskın.'
  } else if (instrument === 'MEDA') {
    result.values = { pressurePa: round(600 + r * 150), airTemperatureK: round(205 + random(state) * 35), windMps: round(1 + random(state) * 9), dustOpacity: round(.25 + random(state) * .65) }
    result.summary = 'Basınç, hava sıcaklığı, rüzgâr ve optik toz kalınlığı ölçüldü.'
  } else {
    result.values = { layerDepthM: round(2 + r * 12), dipRad: round(.05 + random(state) * .3) }
    result.summary = `${result.values.layerDepthM} m derinde tabakalı yansıtıcı; buz tanısı değildir.`
  }
  state.measurements.push(result)
  state.message = `${instrument} ölçümü kaydedildi.`
}
/** Fixed sim step (caller uses <= .1 s). Warp changes elapsed simulation seconds, never speed limit. */
export function stepRover(state, dt) {
  if (!Number.isFinite(dt) || dt < 0 || dt > .100001) throw new RangeError('Rover step must be 0…0.1 s')
  if (!dt) return state
  state.elapsedS += dt; state.speedMps = 0
  if (state.batteryKWh <= 0 && state.mode !== 'parked') commandRover(state, 'park')
  const load = ROVER_LOAD_W[state.mode]
  state.batteryKWh = Math.max(0, Math.min(ROVER_BATTERY_KWH, state.batteryKWh + (ROVER_GENERATOR_W - load) * dt / 3600000))
  if (state.mode === 'driving') {
    const next = state.path[0]
    if (!next) { state.mode = 'parked'; return state }
    const dx = next.x - state.x, dz = next.z - state.z, d = Math.hypot(dx, dz)
    if (d < 1e-8) { state.path.shift(); if (!state.path.length) { state.mode = 'parked'; state.message = 'Hedefe ulaşıldı. Bilim işlemi seç.' }; return state }
    const desired = Math.atan2(dx, dz), error = Math.atan2(Math.sin(desired - state.heading), Math.cos(desired - state.heading))
    const turn = Math.min(Math.abs(error), ROVER_TURN_RAD_S * dt)
    state.heading += Math.sign(error) * turn
    // Turn in place before translating; no corner cutting through keep-out circles.
    if (Math.abs(error) > .001) return state
    const travel = Math.min(d, ROVER_MAX_SPEED_MPS * dt)
    state.x += dx / d * travel; state.z += dz / d * travel
    state.speedMps = travel / dt; state.odometerM += travel
  } else if (state.mode === 'analyzing' || state.mode === 'sampling') {
    state.operationRemainingS -= dt
    if (state.operationRemainingS <= 1e-8) {
      const site = stationAt(state)
      if (state.mode === 'sampling') {
        state.samples.push({ tube: state.samples.length + 1, stationId: site.id, stationName: site.name, elapsedS: state.elapsedS, sealed: true })
        state.tubesRemaining = ROVER_TUBES - state.samples.length; state.message = 'Numune mühürlendi.'
      } else {
        measure(state, state.instrumentQueue.shift(), site)
        if (state.instrumentQueue.length) { state.operationRemainingS = 24; return state }
      }
      state.mode = 'parked'; state.operationRemainingS = 0
    }
  }
  return state
}
