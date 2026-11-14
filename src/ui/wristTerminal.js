/**
 * ARES Mark-IV terminal — Samet's orange display, with an original layered EVA grip.
 * DOM/CSS adaptation shares one lightweight overlay between flight and colony.
 * No extra renderer, texture, simulated medical readings or independent mission clock.
 */
import './wrist.css';

const format = (value, digits = 1) => Number.isFinite(value)
  ? value.toLocaleString('tr-TR', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const reading = (value, unit, digits = 1) => Number.isFinite(value) ? `${format(value, digits)} ${unit}` : '—';
const escape = value => String(value ?? '—').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const row = (label, value) => `<div class="ares-row"><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`;
const card = (label, value, note = '') => `<div class="ares-card"><small>${escape(label)}</small><strong>${escape(value)}</strong>${note ? `<span>${escape(note)}</span>` : ''}</div>`;
const resourceNames = { oxygen: 'O₂ / OKSİJEN', water: 'SU', food: 'GIDA' };

function screenMarkup(data, screen) {
  const colony = data.mode === 'colony';
  if (screen === 1) {
    return `<div class="ares-resource-grid">${Object.entries(resourceNames).map(([key, label]) => {
      const resource = data.resources?.[key] ?? {};
      return card(label, reading(colony ? resource.sols : resource.days, colony ? 'sol' : 'gün'),
        colony ? `${reading(resource.personSols, 'kişi-sol')} · ${reading(resource.days, 'Dünya günü')}` : reading(resource.kg, 'kg'));
    }).join('')}</div><p class="ares-note">${colony ? `${data.livingCrew} yaşayan mürettebatın tüketimine göre. Üretim kredisi dahil değildir.` : `${data.crew?.length ?? 0} kişi · NASA BVAD günlük tüketimi · geri kazanım kredisi yok.`}</p>`;
  }
  if (screen === 2) {
    if (colony) {
      const energy = data.energy ?? {};
      return `<dl>${row('Aktif görev', data.activeTask)}${row('Hava', data.stormLabel)}${row('Son sol üretim / tüketim', `${reading(energy.generation, 'birim')} / ${reading(energy.used, 'birim')}`)}${row('Batarya / kapasite', `${reading(energy.battery, 'birim')} / ${reading(energy.capacity, 'birim')}`)}${row('Başlangıç enerjisi', reading(energy.startup, 'birim'))}${row('Güneş yüksekliği', reading(data.sunElevationDeg, '°'))}${row('Baş lambası / L', data.headlamp === null ? 'Veri bekleniyor' : data.headlamp ? 'Açık' : 'Kapalı')}</dl>`;
    }
    const nav = data.navigation ?? {};
    return `<div class="ares-nav-grid">${card(nav.distanceLabel, reading(nav.distance, nav.distanceUnit, nav.distanceUnit === 'AU' ? 3 : 1))}${card(nav.velocityLabel, reading(nav.velocity, nav.velocityUnit, 2))}</div><dl>${row('Uçuş fazı', data.phaseLabel)}${row('Sonraki olay', data.nextEvent)}</dl>`;
  }
  if (screen === 3) {
    return `<div class="ares-crew">${(data.crew ?? []).map(person => `<article><div><b>${escape(person.name)}</b><span>${escape(person.roleLabel)}</span></div><strong>${person.alive ? reading(person.health, '%', 0) : 'YAŞAM BULGUSU YOK'}</strong></article>`).join('') || '<p class="ares-note">Mürettebat verisi bekleniyor.</p>'}</div><p class="ares-note">${data.livingCrew ?? 0} yaşayan mürettebat · sağlık görev simülasyonundan alınır.</p>`;
  }
  const remaining = Object.values(data.resources ?? {}).map(resource => colony ? resource.sols : resource.days).filter(Number.isFinite);
  const limit = remaining.length ? Math.min(...remaining) : null;
  return `<div class="ares-status-grid">${card(colony ? 'MARS YEREL SAATİ / LMST' : 'GÖREV ZAMANI / MET', colony ? data.lmst ?? '—' : data.met,
    colony ? `SOL ${format(data.sol, 0)}` : data.phaseLabel)}${card('YAŞAM DESTEĞİ / EN AZ', reading(limit, colony ? 'sol' : 'gün'), `${data.livingCrew ?? 0} yaşayan mürettebat`)}</div>
    <dl>${row(colony ? 'Hava durumu' : 'Kabin güç hattı', colony ? data.stormLabel : data.power?.enabled === null ? 'Veri bekleniyor' : data.power?.enabled ? 'Devrede' : 'Kapalı')}${row(colony ? 'Aktif görev' : 'Sonraki olay', data.nextEvent)}</dl>`;
}

/**
 * @param {{root: HTMLElement, getData: () => object|null, onToggle?: (raised: boolean) => void}} options
 * getData returns flightWristData()/colonyWristData(). onToggle is optional host UI synchronization.
 */
export function mountWristTerminal({ root, getData, onToggle = () => {} }) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const host = doc.createElement('aside');
  host.className = 'ares-wrist';
  host.setAttribute('aria-label', 'ARES kol bilgisayarı');
  host.setAttribute('aria-hidden', 'true');
  // TABLET: one coordinate system keeps the grip attached during resizing and animation.
  // GAME ASSUMPTION: illustrative EVA equipment proportions; no physical readings are invented.
  const artBase = `${import.meta.env.BASE_URL}art/`;
  host.innerHTML = `<div class="ares-arm" inert><div class="ares-hold">
    <img class="ares-grip ares-grip-back" src="${artBase}eva-tablet-grip-back.svg" alt="" aria-hidden="true" draggable="false" width="900" height="620">
    <section class="ares-case"><i class="ares-screw ares-screw-tl"></i><i class="ares-screw ares-screw-tr"></i><i class="ares-screw ares-screw-bl"></i><i class="ares-screw ares-screw-br"></i>
      <div class="ares-hardware" aria-hidden="true"><span>ARES / EVA</span><i></i><i></i><i></i><b>IV</b></div>
      <div class="ares-screen"><header class="ares-header"><b><i></i> ARES <span>MARK-IV</span></b><button type="button" class="ares-close" aria-label="Kolu indir">ESC ×</button></header>
      <div class="ares-location"><span data-ares-phase></span><time data-ares-clock></time></div>
      <nav class="ares-tabs" aria-label="Terminal ekranları">${['DURUM', 'YAŞAM DESTEĞİ', 'SEYİR', 'MÜRETTEBAT'].map((name, index) => `<button type="button" data-ares-tab="${index}" aria-pressed="${index === 0}">${name}</button>`).join('')}</nav>
      <div class="ares-content"></div><footer class="ares-footer"><span>ALT / Q · KOLU İNDİR</span><span>TAB / TEKERLEK · SAYFA</span><b data-ares-page>01 / 04</b></footer></div>
      <div class="ares-case-label" aria-hidden="true">EVA · GÖREV TERMİNALİ <span>ARES—01</span></div>
    </section>
    <img class="ares-grip ares-grip-front" src="${artBase}eva-tablet-grip-front.svg" alt="" aria-hidden="true" draggable="false" width="900" height="620">
    </div></div>`;
  root.append(host);
  const arm = host.querySelector('.ares-arm'), content = host.querySelector('.ares-content');
  const phase = host.querySelector('[data-ares-phase]'), clock = host.querySelector('[data-ares-clock]');
  const page = host.querySelector('[data-ares-page]'), tabs = [...host.querySelectorAll('[data-ares-tab]')];
  let raised = false, screen = 0, disposed = false, timer = null, lastMarkup = '';
  const removers = [];
  const on = (target, type, handler, options) => {
    const listenerOptions = typeof options === 'boolean' ? { capture: options } : options;
    target.addEventListener(type, handler, listenerOptions);
    removers.push(() => target.removeEventListener(type, handler, listenerOptions));
  };
  function update() {
    if (!raised || disposed) return;
    const data = getData();
    host.setAttribute('data-light', data?.mode === 'colony' ? 'mars' : 'cabin');
    const markup = data ? screenMarkup(data, screen) : '<p class="ares-note">Telemetri bağlantısı bekleniyor.</p>';
    if (markup !== lastMarkup) { content.innerHTML = markup; lastMarkup = markup; }
    phase.textContent = data?.mode === 'colony' ? `JEZERO · SOL ${format(data.sol, 0)}` : data?.phaseLabel ?? 'VERİ BEKLENİYOR';
    // Samet's live clock remains a clearly labelled Earth UTC clock, separate from MET / LMST.
    clock.textContent = `UTC ${new Date().toISOString().slice(11, 19)}`;
    tabs[2].textContent = data?.mode === 'colony' ? 'KOLONİ' : 'SEYİR';
  }
  function setRaised(value, notify = false) {
    if (disposed || raised === Boolean(value)) return;
    raised = Boolean(value);
    host.classList.toggle('is-raised', raised);
    host.setAttribute('aria-hidden', String(!raised));
    arm.inert = !raised;
    if (raised) {
      update();
      timer = win.setInterval(update, 250); // UI sampling only; mission time comes from getData.
    } else {
      win.clearInterval(timer); timer = null;
      if (host.contains(doc.activeElement)) doc.activeElement.blur();
    }
    if (notify) onToggle(raised);
  }
  const toggle = () => setRaised(!raised, true);
  function selectPage(index) {
    screen = (index + tabs.length) % tabs.length;
    tabs.forEach((tab, i) => tab.setAttribute('aria-pressed', String(i === screen)));
    page.textContent = `0${screen + 1} / 04`;
    update();
  }
  on(win, 'keydown', event => {
    const editable = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName) || event.target?.isContentEditable;
    const alt = event.key === 'Alt' || ['AltLeft', 'AltRight'].includes(event.code);
    const q = event.code === 'KeyQ' || event.key?.toLowerCase() === 'q';
    const close = event.key === 'Escape' || event.code === 'Escape';
    const tab = event.key === 'Tab' || event.code === 'Tab';
    if (editable && !close || event.metaKey || event.ctrlKey || q && (event.altKey || event.shiftKey)) return;
    if (!(alt || q || raised && (close || tab))) return;
    // Capture before the flight's old Q action and the colony document-level FPS bindings.
    // Pointer lock is deliberately retained: Alt/Q/Tab work entirely from the keyboard.
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    if (alt || q) toggle();
    else if (close) setRaised(false, true);
    else selectPage(screen + (event.shiftKey ? -1 : 1));
  }, true);
  on(win, 'keyup', event => {
    // Suppress Alt's native menu activation on release as well as press.
    if (event.key === 'Alt' || ['AltLeft', 'AltRight'].includes(event.code)) event.preventDefault();
  }, true);
  on(win, 'wheel', event => {
    if (!raised) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.deltaY) selectPage(screen + Math.sign(event.deltaY));
  }, { capture: true, passive: false });
  on(host.querySelector('.ares-close'), 'click', () => setRaised(false, true));
  tabs.forEach((tab, index) => on(tab, 'click', () => selectPage(index)));
  return {
    toggle, setRaised, update,
    get raised() { return raised; },
    get screen() { return screen; },
    dispose() {
      if (disposed) return;
      disposed = true; win.clearInterval(timer);
      removers.forEach(remove => remove()); host.remove();
    },
  };
}
