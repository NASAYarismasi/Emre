import { colonyReport, modules, roles } from './mars-koloni.mjs';
import { LIFE_SOL_SECONDS } from '../sim/colonyLifeSupport.js';
import './dashboard.css';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const numeric = value => finite(value) ? value : null;
const list = value => Array.isArray(value) ? value : [];
const sum = value => Object.values(value ?? {}).reduce((total, n) => total + (finite(n) ? n : 0), 0);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const format = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const f = value => finite(value) ? format.format(value) : '—';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const SOURCES = {
  bvad: ['NASA BVAD · kişi başına Dünya gününde 0,84 kg O₂ ve 3,52 kg su. Rezervler mevcut canlı ekip içindir.', 'https://ntrs.nasa.gov/citations/20150002905'],
  moxie: ['NASA / MOXIE · gerçek gösterici en çok 12 g O₂/saat üretti. Üsteki üretici insanlı üs ölçeğinde bir oyun modelidir.', 'https://www.nasa.gov/solar-system/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/'],
  rover: ['NASA / Perseverance · 43 numune tüpü. Bu oyundaki rover görevleri ve batarya bir görev varsayımıdır.', 'https://science.nasa.gov/resource/installing-perseverances-sample-tubes/'],
};
const info = key => `<a class="dash-info" href="${SOURCES[key][1]}" title="${SOURCES[key][0]}" aria-label="${SOURCES[key][0]}" target="_blank" rel="noopener noreferrer">ℹ</a>`;

/** Project İhan's per-sol ledger without treating educational energy as kWh.
 * Actual consumed stocks are reconstructed from adjacent stock balances; electrolysis
 * and meal preparation may remove more water than the basic crew ration.
 */
export function mapTimeline(state = {}) {
  const rows = list(state.timeline);
  return rows.map((row, index) => {
    const previous = rows[index - 1]?.supplies;
    const consumed = row.consumed ? sum(row.consumed) : previous && row.supplies
      ? ['food', 'water', 'oxygen'].reduce((total, key) => total + Math.max(0, (previous[key] ?? 0) + (row.produced?.[key] ?? 0) - (row.supplies[key] ?? 0)), 0) : null;
    return { sol: row.sol, produced: sum(row.produced), consumed,
      needsMet: Object.keys(row.needs ?? {}).length ? Object.values(row.needs).every(Boolean) : null,
      generation: numeric(row.generation), used: numeric(row.used), battery: numeric(row.battery) };
  });
}

/** Read-only, missing-safe telemetry contract. No DOM, renderer or simulation writes. */
export function mapDashboardTelemetry(telemetry = {}, roverEvent = null) {
  const state = telemetry.state ?? {}, life = telemetry.lifeSupport ?? {}, env = telemetry.environment ?? {};
  const air = life.air ?? {}, water = life.water ?? {}, greenhouse = life.greenhouse ?? {}, controls = life.controls ?? {};
  const crew = list(state.crew), agents = list(telemetry.crewAgents), alive = crew.filter(p => p.health > 0).length;
  const day = list(state.timeline).at(-1) ?? {};
  const report = crew.length ? colonyReport({ ...state, sol: state.sol ?? 0, crew, timeline: list(state.timeline) }) : { status: 'in-progress', reasons: [] };
  const playerPosition = positionOf(telemetry.player);
  const inferredPlayer = telemetry.fps && playerPosition
    ? agents.find(a => Math.hypot(a.x - playerPosition.x, a.z - playerPosition.z) < 1)?.index : undefined;
  const playerId = telemetry.playerId ?? telemetry.player?.id ?? crew[inferredPlayer]?.id;
  const lamps = [
    ['Fanlar', controls.air?.fans, air.fans], ['CO₂ tutucu', controls.air?.scrubber, air.scrubber],
    ['O₂ üretici', controls.air?.producer, air.producer], ['Buz çıkarıcı', controls.water?.extract, water.extractor],
    ['Geri kazanım', controls.water?.recycle, water.recycler], ['Sera LED', controls.greenhouse?.led !== undefined ? controls.greenhouse.led !== 'off' : undefined, greenhouse.ledOn],
    ['Su pompası', controls.greenhouse?.irrigation, greenhouse.pumpOn],
  ].map(([label, enabled, running]) => ({ label, status: enabled === false ? 'off' : running === true ? 'running' : enabled === undefined ? 'unknown' : 'standby' }));
  const rover = telemetry.rover ?? roverEvent;
  // GAME ASSUMPTION: illustrative exterior air temperature from solar elevation,
  // not a meteorological measurement or a new physics state.
  // Match the existing environment HUD's estimate exactly; it is not live weather.
  const temperatureC = finite(env.sunElevationDeg) ? Math.round(-80 + 60 * Math.max(0, Math.sin(env.sunElevationDeg * Math.PI / 180)) ** .55) : null;
  return {
    connected: Boolean(telemetry.state), sol: numeric(state.sol), report, alive,
    lmst: numeric(env.lmst), sunElevationDeg: numeric(env.sunElevationDeg), temperatureC,
    storm: Boolean(env.storm ?? telemetry.storm ?? day.storm), warp: numeric(env.warp), headlamp: env.headlamp,
    time: finite(air.elapsedHours) ? air.elapsedHours * 3600 : finite(env.unixSeconds) ? env.unixSeconds : (state.sol ?? 0) * LIFE_SOL_SECONDS,
    oxygenKg: numeric(life.oxygenKg ?? air.oxygenKg), oxygenHours: numeric(life.oxygenHours), co2Kg: numeric(air.co2Kg),
    waterL: numeric(life.waterL ?? water.cleanL), waterDays: numeric(life.waterDays), iceKg: numeric(water.iceKg),
    oxygenProduced: numeric(air.generatedKg), oxygenConsumed: numeric(air.consumedKg), co2Removed: numeric(air.removedCO2Kg),
    waterExtracted: numeric(water.extractedL), waterRecycled: numeric(water.recoveredL), waterConsumed: numeric(water.consumedL), lamps,
    power: { available: numeric(life.availableKW), used: numeric(life.powerKW), air: numeric(air.powerUsedKW), water: numeric(water.powerUsedKW), greenhouse: numeric(greenhouse.powerKW),
      battery: numeric(state.battery), generation: numeric(day.generation), colonyUsed: numeric(day.used), startup: numeric(state.startupEnergy), spentKWh: numeric(life.spentKWh) },
    supplies: ['food', 'water', 'oxygen'].map((key, i) => ({ key, label: ['Gıda', 'Su', 'Oksijen'][i], stock: numeric(state.supplies?.[key]),
      sols: alive && finite(state.supplies?.[key]) ? state.supplies[key] / alive : null })),
    timeline: mapTimeline(state), crew: crew.map((person, index) => {
      const agent = agents.find(a => a.id === person.id || a.index === index);
      return { ...person, index, player: person.id === playerId, roleLabel: roles[person.role] ?? 'Rutin EVA',
        mode: agent?.mode ?? 'unknown', site: agent?.site, position: positionOf(agent) };
    }), playerPosition, placed: list(state.placed),
    rover: rover ? { ...rover, position: positionOf(rover.position ?? rover), measurements: list(rover.measurements).slice().reverse(), samples: Array.isArray(rover.samples) ? rover.samples.length : numeric(rover.samples) } : null,
  };
}

function positionOf(value) {
  if (Array.isArray(value)) return finite(value[0]) && finite(value[2]) ? { x: value[0], z: value[2] } : null;
  return finite(value?.x) && finite(value?.z) ? { x: value.x, z: value.z } : null;
}

/** At most one point per simulated minute, bounded to the last two model sols. */
export function appendHistory(history, snapshot) {
  if (!finite(snapshot.time)) return history;
  const last = history.at(-1);
  if (last && snapshot.time < last.time) history = [];
  const point = { time: snapshot.time, oxygenKg: snapshot.oxygenKg, waterL: snapshot.waterL, powerKW: snapshot.power.used };
  const next = history.filter(p => p.time >= snapshot.time - 2 * LIFE_SOL_SECONDS);
  // GAME ASSUMPTION: one-minute display sampling; this does not step the simulation.
  if (next.length && Math.floor(next.at(-1).time / 60) === Math.floor(point.time / 60)) next[next.length - 1] = point;
  else next.push(point);
  return next;
}

export function sparklinePoints(history, key, width = 180, height = 28) {
  const points = history.filter(p => finite(p[key]));
  if (points.length < 2) return '';
  const min = Math.min(...points.map(p => p[key])), max = Math.max(...points.map(p => p[key]));
  const start = points[0].time, span = points.at(-1).time - start;
  return points.map(p => `${fSvg(span ? (p.time - start) / span * width : 0)},${fSvg(height - 2 - (p[key] - min) / (max - min || 1) * (height - 4))}`).join(' ');
}
const fSvg = n => Number(n.toFixed(2));

const taskLabels = { greenhouse: 'Sera · bitki bakımı', air: 'Hava tesisi · filtre kontrolü', water: 'Su tesisi · matkap bakımı', solar: 'Güneş tarlası · toz temizliği', pad: 'Kurulum alanı · ölçüm', rover: 'Rover · numune kontrolü' };
const modeLabels = { idle: 'Beklemede', walking: 'Yürüyor', working: 'Çalışıyor', parked: 'Park halinde', driving: 'Sürüşte', manual: 'Manuel', autonomous: 'Otonom', sampling: 'Numune alıyor', scanning: 'Ölçüm yapıyor', unknown: 'Veri bekleniyor' };
const modeText = mode => modeLabels[mode] ?? 'Görevde';
const metric = (label, value, unit, note = '') => `<div class="dash-metric"><span>${label}</span><div><strong>${f(value)}</strong><em>${unit}</em></div>${note ? `<small>${note}</small>` : ''}</div>`;
const pair = (label, value, unit = '') => `<div class="dash-pair"><span>${label}</span><b>${f(value)} <small>${unit}</small></b></div>`;
const card = (className, number, title, side, content) => `<section class="dash-card ${className}"><header><h2><span>${number}</span>${title}</h2><small>${side}</small></header>${content}</section>`;
const status = (text, tone = 'mint') => `<span class="dash-status ${tone}"><i></i>${text}</span>`;

function trend(history, key) {
  const points = sparklinePoints(history, key);
  return points ? `<svg class="dash-spark" viewBox="0 0 180 28" role="img" aria-label="Son iki sol içinde biriken rezerv eğilimi"><polyline points="${points}"/></svg>` : '<div class="dash-spark dash-empty-trend">Eğilim için veri birikiyor</div>';
}

// GAME ASSUMPTION: the fixed Düz Ova installation plan mirrors the scene hosts
// (crater-ecosystem.mjs, life-support.mjs, solar-farm.mjs, mars-demo.mjs).
// The existing telemetry omits these fixed assets; placed modules and people are live.
const BASE_PLAN = [
  { x: -9, z: 0, kind: 'dome', label: 'YAŞAM' }, { x: 0, z: 0, kind: 'dome' }, { x: 9, z: 0, kind: 'dome' },
  { x: 26, z: -11, kind: 'greenhouse', label: 'SERA' }, { x: 19, z: 6, kind: 'plant', label: 'HAVA' },
  { x: 64, z: -26, kind: 'plant', label: 'SU / BUZ' }, { x: -18, z: -12, kind: 'lander', label: 'İNİŞ ARACI' },
  { x: -57, z: 46, kind: 'solar', label: 'GÜNEŞ TARLASI' },
];

export function mapBaseMarkers(snapshot) {
  return [...BASE_PLAN.map(p => ({ ...p, fixed: true })),
    ...list(snapshot.placed).flatMap(p => { const pos = positionOf(p.position ?? p); return pos ? [{ ...pos, kind: 'module', label: modules[p.type]?.name ?? 'Modül' }] : []; }),
    ...list(snapshot.crew).filter(p => p.position && !p.player && p.health > 0).map(p => ({ ...p.position, kind: 'crew', label: `A${p.index + 1}` })),
    ...(snapshot.playerPosition ? [{ ...snapshot.playerPosition, kind: 'player', label: 'SEN' }] : []),
    ...(snapshot.rover?.position ? [{ ...snapshot.rover.position, kind: 'rover', label: 'ROVER' }] : [])];
}

function baseMap(snapshot, roverOnly = false) {
  const markers = mapBaseMarkers(snapshot);
  const fixedMarkers = markers.filter(p => !['rover','player','crew'].includes(p.kind)); // ROVER2: keep the base readable while the camera follows the rover.
  const extentX = fixedMarkers.map(p => p.x), extentZ = fixedMarkers.map(p => p.z); // ROVER2
  const minX = Math.min(-85, ...extentX) - 9, minZ = Math.min(-42, ...extentZ) - 12;
  const width = Math.max(80, ...extentX) + 12 - minX, height = Math.max(75, ...extentZ) + 8 - minZ;
  const scale = Math.max(width / 400, height / 230), mapW = scale * 400, mapH = scale * 230;
  const shapes = markers.map(p => {
    const x = p.kind === 'rover' ? Math.max(9, Math.min(mapW-9,p.x-minX)) : p.x-minX, z = p.kind === 'rover' ? Math.max(17,Math.min(mapH-24,p.z-minZ)) : p.z-minZ; // ROVER2: edge clamp preserves live bearing.
    if(p.kind === 'rover') return `<g class="map-rover"><title>Rover · X ${f(p.x)} / Z ${f(p.z)} m</title><circle cx="${x}" cy="${z}" r="2.6"/><text x="${x}" y="${z+12}" text-anchor="${x>mapW/2?'end':'start'}" style="text-anchor:${x>mapW/2?'end':'start'};font-size:${mapW/(roverOnly?24:35)}px;fill:#f0c278;stroke:none">ROVER · ${f(snapshot.rover.distanceFromBaseM)} m</text></g>`; // ROVER2: readable distance stays visible on both maps.
    const shape = p.kind === 'dome' ? `<circle cx="${x}" cy="${z}" r="4.3"/>`
      : p.kind === 'solar' ? `<rect x="${x - 20}" y="${z - 24}" width="40" height="48" rx="1"/><path d="M${x-20} ${z-8}h40m-40 16h40m-27-32v48m14-48v48"/>`
      : p.kind === 'greenhouse' ? `<rect x="${x-5}" y="${z-6}" width="10" height="12" rx="3"/>`
      : p.kind === 'player' ? `<path d="M${x} ${z-3.4}l2.5 6-2.5-1-2.5 1z"/>`
      : ['crew', 'rover'].includes(p.kind) ? `<circle cx="${x}" cy="${z}" r="${p.kind === 'rover' ? 2.6 : 1.7}"/>`
      : `<rect x="${x-2.5}" y="${z-2.5}" width="5" height="5" rx=".6"/>`;
    return `<g class="map-${p.kind}"><title>${escape(p.label ?? 'Habitat')} · X ${f(p.x)} / Z ${f(p.z)} m</title>${shape}${p.label && !roverOnly ? `<text x="${x}" y="${z + (p.kind === 'solar' ? 29 : p.kind === 'lander' ? -7 : p.label === 'A3' ? 12 : 8)}">${escape(p.label)}</text>` : ''}</g>`;
  }).join('');
  return `<svg class="dash-map ${roverOnly ? 'dash-rover-map' : ''}" viewBox="0 0 ${mapW} ${mapH}" role="img" aria-label="Düz Ova üs planı; kuzey yukarı, doğu sağda"><defs><pattern id="dash-grid-${roverOnly}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#93d9c7" stroke-opacity=".09" stroke-width=".25"/></pattern></defs><rect width="100%" height="100%" fill="url(#dash-grid-${roverOnly})"/><path class="dash-map-route" d="M${-57-minX} ${46-minZ}L${-18-minX} ${-12-minZ}L${26-minX} ${-11-minZ}L${64-minX} ${-26-minZ}"/>${shapes}<g class="dash-map-scale"><path d="M8 ${mapH-10}h20m-20-2v4m20-4v4"/><text x="18" y="${mapH-14}">20 m</text><text x="${mapW-10}" y="12">↑ K</text></g></svg>`;
}

function timelineChart(rows) {
  if (!rows.length) return '<div class="dash-no-data">Sol günlüğü henüz başlamadı.<small>İlk sol hesabından sonra üretim ve tüketim burada görünür.</small></div>';
  const max = Math.max(1, ...rows.flatMap(r => [r.produced, r.consumed ?? 0]));
  return `<div class="dash-sol-chart">${rows.slice(-10).map(r => `<div title="Sol ${r.sol} · Üretim ${f(r.produced)} / tüketim ${f(r.consumed)} kişi-sol"><div class="dash-sol-bars"><i style="height:${r.produced/max*100}%"></i><i style="height:${(r.consumed ?? 0)/max*100}%"></i></div><span>${r.sol}</span><b class="${r.needsMet === false ? 'red' : 'mint'}">${r.needsMet === null ? '·' : r.needsMet ? '✓' : '×'}</b></div>`).join('')}</div>`;
}

function renderDashboard(s, history) {
  const reportText = { 'in-progress': 'Görev sürüyor', success: 'Görev başarılı', failed: 'Görev başarısız' }[s.report.status];
  const tone = s.report.status === 'failed' ? 'red' : 'mint';
  const lmst = finite(s.lmst) ? `${String(Math.floor(s.lmst)).padStart(2, '0')}:${String(Math.floor(s.lmst % 1 * 60)).padStart(2, '0')}` : '—';
  const summary = `<section class="dash-summary" aria-label="Görev özeti"><div class="dash-sol"><span>YÜZEY GÖREVİ</span><strong>SOL ${finite(s.sol) ? String(s.sol).padStart(2, '0') : '—'}<small> / 10</small></strong><div class="dash-progress"><i style="width:${clamp(s.sol ?? 0,0,10)*10}%"></i></div></div><div class="dash-summary-stat"><span>YEREL MARS SAATİ</span><b>${lmst}<small> LMST</small></b></div><div class="dash-summary-stat"><span>GÜNEŞ YÜKSEKLİĞİ</span><b>${f(s.sunElevationDeg)}<small> °</small></b></div><div class="dash-summary-stat" title="Oyun varsayımı: güneş yüksekliğinden türetilen temsili dış hava sıcaklığı; hava istasyonu ölçümü değildir."><span>DIŞ SICAKLIK / TAHMİN</span><b>${f(s.temperatureC)}<small> °C</small></b></div><div class="dash-summary-stat"><span>ATMOSFER</span>${status(s.storm ? 'Toz fırtınası' : 'Fırtına yok', s.storm ? 'amber' : 'mint')}<small>Yüzey zamanı ${f(s.warp)}×</small></div><div class="dash-mission-status"><span>GÖREV DURUMU</span>${status(reportText, tone)}<small title="${escape(s.report.reasons.join(' '))}">${escape(s.report.reasons[0] ?? 'Hedef · 3 astronot / 10 sol')}</small></div></section>`;
  const life = card('dash-life', '01', 'Yaşam desteği', `FİZİKSEL REZERVLER ${info('bvad')}`, `<div class="dash-reserves"><div>${metric('OKSİJEN TANKI',s.oxygenKg,'kg',`${f(s.oxygenHours)} saat rezerv`)}${trend(history,'oxygenKg')}</div><div>${metric('TEMİZ SU TANKI',s.waterL,'L',`${f(s.waterDays)} Dünya günü rezerv`)}${trend(history,'waterL')}</div></div><div class="dash-life-details">${pair('CO₂ stok',s.co2Kg,'kg')}${pair('CO₂ uzaklaştırıldı',s.co2Removed,'kg')}${pair('Kalan buz',s.iceKg,'kg')}${pair('O₂ üretildi '+info('moxie'),s.oxygenProduced,'kg')}${pair('O₂ tüketildi',s.oxygenConsumed,'kg')}${pair('Su tüketildi',s.waterConsumed,'L')}${pair('Buzdan çıkarıldı',s.waterExtracted,'L')}${pair('Su geri kazanıldı',s.waterRecycled,'L')}</div><div class="dash-lamps">${s.lamps.map(l => `<span class="lamp-${l.status}" title="${l.status === 'running' ? 'Çalışıyor' : l.status === 'off' ? 'Anahtardan kapalı' : l.status === 'standby' ? 'Anahtar açık; güç, talep veya otomatik koşul bekleniyor' : 'Telemetri bekleniyor'}"><i></i>${l.label}</span>`).join('')}</div><div class="dash-card-note">● Çalışıyor <span>● Açık / beklemede</span> ○ Kapalı · Eğilim: son 2 sol</div>`);
  const map = card('dash-base', '02', 'Üs konum haritası', 'DÜZ OVA / METRE', `${baseMap(s)}<div class="dash-map-legend"><span><i class="map-key-player"></i>Sen</span><span><i></i>Ekip</span><span><i class="map-key-rover"></i>Rover</span><small>+X doğu · −Z kuzey</small></div><div class="dash-card-note">Sabit tesis planı · Ekip, rover ve yerleştirilen modüller canlı</div>`);
  const denominator = Math.max(s.power.available ?? 0, s.power.used ?? 0, 0.001);
  const energy = card('dash-energy', '03', 'Enerji', 'GÜÇ DAĞITIMI', `<div class="dash-energy-head">${metric('KULLANILAN GÜÇ',s.power.used,'kW')}<span>/ ${f(s.power.available)}<small> kW ayrılabilir</small></span></div><div class="dash-power-bar" role="img" aria-label="Hava, su ve sera güç tüketimi">${['air','water','greenhouse'].map(k=>`<i class="power-${k}" style="width:${clamp((s.power[k]??0)/denominator*100,0,100)}%"></i>`).join('')}</div><div class="dash-power-legend">${[['air','Hava'],['water','Su'],['greenhouse','Sera']].map(([k,label])=>`<span><i class="power-${k}"></i>${label}<b>${f(s.power[k])} kW</b></span>`).join('')}</div><div class="dash-energy-ledger">${pair('Koloni bataryası',s.power.battery,'oyun birimi')}${pair('Son sol üretim / harcama',s.power.generation,`/ ${f(s.power.colonyUsed)} birim`)}${pair('Başlangıç enerjisi',s.power.startup,'birim')}${pair('Tesisler · bu sol harcanan',s.power.spentKWh,'kWh')}</div><div class="dash-callout ${s.storm?'amber':''}">${s.storm?'Toz fırtınası · Güneş üretimi kısıtlı.':'Güneş üretimi · Fırtına kaybı yok.'}<small>Koloni enerji birimleri fiziksel kWh’den ayrı izlenir.</small></div>`);
  const supplies = card('dash-supplies', '04', 'Erzak & sol günlüğü', `İHAN’IN KOLONİ HESABI ${info('bvad')}`, `<div class="dash-stock-grid">${s.supplies.map(p=>metric(p.label.toLocaleUpperCase('tr'),p.stock,'kişi-sol',`${f(p.sols)} sol / ${s.alive} yaşayan kişi`)).join('')}</div><div class="dash-chart-heading"><span>SOL BAŞINA TOPLAM / KİŞİ-SOL</span><small><i></i>Üretim <i></i>Tüketim</small></div>${timelineChart(s.timeline)}<div class="dash-card-note">✓ Temel ihtiyaçlar karşılandı · İlk sol tüketimi bilinmiyorsa çizilmez.<br>Rezerv süreleri Mars soludur; fiziksel su rezervi Dünya günüdür.</div>`);
  const rover = card('dash-rover', '05', 'Rover keşif telemetrisi', `NUMUNELER ${info('rover')}`, s.rover ? `<div class="dash-rover-top"><div>${baseMap(s,true)}</div><div>${status(modeText(s.rover.mode))}${pair('Kat edilen',s.rover.odometerM,'m')}${pair('Batarya',s.rover.batteryKWh,'kWh')}<div class="dash-pair"><span>Numune tüpü</span><b>${f(s.rover.samples)} <small>/ 43</small></b></div></div></div><div class="dash-card-note">X ${f(s.rover.position?.x)} m · Z ${f(s.rover.position?.z)} m · Son ölçümler</div><div class="dash-measurements">${measurementTable(s.rover.measurements)}</div>` : `<div class="dash-rover-wait"><svg viewBox="0 0 100 55" aria-hidden="true"><path d="M18 37h65M25 33l5-13h37l8 13M41 20V9h21M58 9V3M32 20l8 13m18-13 8 13"/><circle cx="28" cy="40" r="6"/><circle cx="52" cy="40" r="6"/><circle cx="77" cy="40" r="6"/></svg><b>Rover bağlantısı bekleniyor</b><small>Konum, ölçümler ve numuneler telemetri geldiğinde görünür.</small></div><div class="dash-card-note">Numune kapasitesi: 43 tüp ${info('rover')} · Veri bulunamadı</div>`);
  const crew = card('dash-crew', '06', 'Mürettebat', `${s.alive} / ${s.crew.length} HAYATTA`, `<div class="dash-crew-list">${s.crew.map(p=>`<article><div class="dash-crew-avatar ${p.player?'is-player':''}">A${p.index+1}</div><div class="dash-crew-person"><div><b>Astronot ${p.index+1}</b>${p.player?'<span>SEN</span>':''}<strong class="${p.health<40?'red':'mint'}">${f(p.health)}<small> /100</small></strong></div><small>${escape(p.roleLabel)} · ${p.player?'Kontrol sende':modeText(p.mode)}</small><div class="dash-health"><i style="width:${clamp(p.health,0,100)}%"></i></div><p>${p.health<=0?'Yaşam belirtisi yok':p.player?'Yüzey operasyonu':escape(taskLabels[p.site]??'Görev verisi bekleniyor')}</p></div></article>`).join('')}</div><div class="dash-card-note">Sağlık ve görev rolleri koloni modelinden okunur.</div>`);
  return { summary, grid: life+map+energy+supplies+rover+crew };
}

function measurementTable(measurements) {
  if (!measurements.length) return '<div class="dash-no-data">Henüz ölçüm kaydı yok.</div>';
  return `<table><thead><tr><th>İstasyon</th><th>Cihaz</th><th>Sonuç</th></tr></thead><tbody>${measurements.slice(0,5).map((m,i)=>{
    const position = positionOf(m.position ?? m);
    // src/sim/rover.js records {instrument, stationName, summary, values}; older/typed records use value/unit.
    const values = m.summary ? escape(m.summary)
      : m.value !== undefined ? `${escape(finite(m.value)?f(m.value):m.value)} ${escape(m.unit ?? '')}`
      : Object.entries(m).filter(([k,v])=>finite(v)&&!['x','y','z','time','timestamp','sol','id','elapsedS'].includes(k)).map(([k,v])=>`${escape(k)}: ${f(v)}`).join(' · ') || '—';
    const where = m.stationName ?? (position ? `${f(position.x)}, ${f(position.z)} m` : `#${measurements.length-i}`);
    return `<tr><td>${escape(where)}</td><td>${escape(m.instrument??m.label??m.type??m.kind??'Yüzey taraması')}</td><td>${values}</td></tr>`;
  }).join('')}</tbody></table>`;
}

/** Mount an independent 2 Hz observer; the scene and its stepping hooks stay intact. */
export function mountDashboard({ root = document.body, button = document.getElementById('dashboard-toggle'), onOpen = () => {} } = {}) {
  const overlay = document.createElement('div');
  overlay.id = 'mission-dashboard'; overlay.className = 'mission-dashboard'; overlay.hidden = true;
  overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-labelledby','dashboard-title');
  overlay.innerHTML = `<div class="dash-shell"><header class="dash-header"><div class="dash-brand">M<span>01</span></div><div><span class="dash-eyebrow">ARES / YÜZEY GÖREV KONTROL</span><h1 id="dashboard-title">Görev paneli <span>DÜZ OVA</span></h1></div><div class="dash-live">${status('Canlı telemetri')}<small>2 Hz · Yüzey operasyonları</small></div><button type="button" class="dash-close" aria-label="Görev panelini kapat">Kapat <kbd>ESC</kbd> ×</button></header><div class="dash-summary-root"></div><div class="dash-grid"></div><footer class="dash-footer"><span>MARS’A İLK KOLONİ <i>/</i> NASA SPACE APPS 2026</span><span class="dash-connection">Telemetri bekleniyor</span><span><kbd>G</kbd> Görev paneli <i>·</i> Sahne çalışmaya devam ediyor</span></footer></div>`;
  root.append(overlay);
  const summaryRoot = overlay.querySelector('.dash-summary-root'), grid = overlay.querySelector('.dash-grid');
  const close = overlay.querySelector('.dash-close'), connection = overlay.querySelector('.dash-connection');
  let history = [], roverEvent = null, lastSnapshot = null, opened = false, previousFocus = null;
  const abort = new AbortController(), options = { signal: abort.signal };
  function poll() {
    try {
      const raw = window.render_game_to_text?.();
      if (!raw) return;
      const telemetry = typeof raw === 'string' ? JSON.parse(raw) : raw;
      // DASHBOARD: selected player is already exposed by the original colony UI.
      lastSnapshot = mapDashboardTelemetry({ ...telemetry, playerId: telemetry.playerId ?? document.getElementById('player')?.value }, roverEvent);
      history = appendHistory(history, lastSnapshot);
      if (opened) draw();
    } catch {
      if (opened) connection.textContent = 'Telemetri kesildi · Son geçerli kayıt gösteriliyor';
    }
  }
  function draw() {
    const view = renderDashboard(lastSnapshot ?? mapDashboardTelemetry(), history);
    // Preserve a focused source link through telemetry updates.
    const sourceIndex = [...overlay.querySelectorAll('.dash-info')].indexOf(document.activeElement);
    summaryRoot.innerHTML = view.summary; grid.innerHTML = view.grid;
    if (sourceIndex >= 0) overlay.querySelectorAll('.dash-info')[sourceIndex]?.focus({ preventScroll:true });
    connection.textContent = lastSnapshot?.connected ? 'Bağlantı etkin · salt okunur telemetri' : 'Telemetri bekleniyor';
  }
  function setOpen(value) {
    if (value === opened) return;
    opened = value; overlay.hidden = !value; button?.setAttribute('aria-expanded',String(value));
    document.body.classList.toggle('dashboard-open',value);
    if (value) { previousFocus = document.activeElement; onOpen(); if (document.pointerLockElement) document.exitPointerLock?.(); poll(); draw(); close.focus({ preventScroll:true }); }
    else { const target = previousFocus?.isConnected ? previousFocus : button; target?.focus({ preventScroll:true }); }
  }
  function onKey(event) {
    const input = event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]');
    if (!opened && (input || event.ctrlKey || event.metaKey || event.altKey || event.code !== 'KeyG')) return;
    if (event.code === 'KeyG' && !event.repeat) { event.preventDefault(); event.stopImmediatePropagation(); setOpen(!opened); return; }
    if (!opened) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setOpen(false); return; }
    event.stopImmediatePropagation();
    if (event.code === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button,a[href]')];
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && index === focusable.length-1) { event.preventDefault(); focusable[0]?.focus(); }
    } else if (!['Enter','Space','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.code)) event.preventDefault();
  }
  window.addEventListener('keydown',onKey,{ ...options, capture:true });
  window.addEventListener('rover:state',event=>{ roverEvent = event.detail?.rover ?? event.detail; },options);
  button?.addEventListener('click',()=>setOpen(!opened),options);
  close.addEventListener('click',()=>setOpen(false),options);
  // GAME ASSUMPTION: UI telemetry refresh rate, not a simulation timestep.
  const timer = window.setInterval(poll,500); poll();
  return { setOpen, get isOpen() { return opened; }, dispose() { window.clearInterval(timer); abort.abort(); overlay.remove(); document.body.classList.remove('dashboard-open'); button?.setAttribute('aria-expanded','false'); } };
}
