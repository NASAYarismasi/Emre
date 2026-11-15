/**
 * ARES Mark-IV wrist terminal — original arm, case and orange display design by Samet.
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
  if(colony) return colonyDashboard(data,screen);
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

function colonyDashboard(data,screen) {
  const t=data.lifeSupport??{}, air=t.air??{},water=t.water??{},energy=data.energy??{};
  const grid=t.electrical, battery=grid?.state?.battery??energy.battery, batteryUnit=grid?'kWh':'birim';
  const tile=(label,value,note,tone='')=>`<article class="ops-metric ${tone}"><small>${escape(label)}</small><strong>${escape(value)}</strong><span>${escape(note)}</span></article>`;
  if(screen===3)return `<div class="ops-heading"><b>MÜRETTEBAT</b><span>${data.livingCrew} kişi görevde</span></div><div class="ares-crew">${(data.crew??[]).map(p=>`<article><div><b>${escape(p.name)}</b><span>${escape(p.roleLabel)}</span></div><strong>${p.alive?reading(p.health,'%',0):'YAŞAM BULGUSU YOK'}</strong></article>`).join('')}</div>`;
  if(screen===2)return `<div class="ops-heading"><b>ENERJİ MERKEZİ</b><span>Canlı tesis telemetrisi</span></div><div class="ops-grid">${tile('TESİSLERE AYRILAN GÜÇ',reading(t.availableKW,'kW'),'Yaşam desteği bütçesi')}${tile('TESİS TÜKETİMİ',reading(t.powerKW,'kW'),'Hava + su sistemleri')}${tile('BATARYADA DEPOLANAN',reading(battery,batteryUnit),grid?'5 grup · toplam 180 kWh':'Koloni enerji birimi · kWh değildir','amber')}${tile('HARCANAN ENERJİ',reading(t.spentKWh,'kWh'),'Bu sol · yaşam desteği','amber')}</div><dl>${row('Son sol güneş üretimi',reading(energy.generation,'birim'))}${row('Son sol batarya kapasitesi',reading(energy.capacity,'birim'))}</dl>`;
  if(screen===1)return `<div class="ops-heading"><b>YAŞAM DESTEĞİ</b><span>Üretim ve rezerv ayrı izlenir</span></div><div class="ops-grid">${tile('ÜRETİLEN SU',reading(water.extractedL,'L'),'Buzdan çıkarılan · toplam','blue')}${tile('REZERV SU',reading(t.waterL,'L'),'Temiz su deposu','blue')}${tile('ÜRETİLEN O₂',reading(air.generatedKg,'kg'),'Oksijen üretimi · toplam')}${tile('REZERV O₂',reading(t.oxygenKg,'kg'),'Kullanılabilir oksijen')}</div><dl>${row('Geri kazanılan su',reading(water.recoveredL,'L'))}${row('Atık su',reading(water.wasteL,'L'))}${row('Giderilen CO₂',reading(air.removedCO2Kg,'kg'))}</dl>`;
  return `<div class="ops-heading"><b>ÜS KONTROL MERKEZİ</b><span>LMST ${escape(data.lmst??'—')}</span></div><div class="ops-grid">${tile('REZERV SU',reading(t.waterL,'L'),`Üretilen ${reading(water.extractedL,'L')}`,'blue')}${tile('REZERV OKSİJEN',reading(t.oxygenKg,'kg'),`Üretilen ${reading(air.generatedKg,'kg')}`)}${tile('TESİS GÜCÜ',reading(t.powerKW,'kW'),`Bütçe ${reading(t.availableKW,'kW')}`,'amber')}${tile('BATARYA',reading(battery,batteryUnit),grid?'5 grup · toplam 180 kWh':'Koloni enerji birimi','amber')}</div><div class="ops-task"><small>AKTİF GÖREV</small><b>${escape(data.activeTask)}</b></div>`;
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
  const artBase = `${import.meta.env.BASE_URL}art/`;
  host.innerHTML = `<div class="ares-arm" inert><div class="ares-hold">
    <img class="ares-grip ares-grip-back" src="${artBase}eva-tablet-grip-back.svg" alt="" aria-hidden="true" draggable="false" width="900" height="620">
    <section class="ares-case"><i class="ares-screw ares-screw-tl"></i><i class="ares-screw ares-screw-tr"></i><i class="ares-screw ares-screw-bl"></i><i class="ares-screw ares-screw-br"></i>
      <div class="ares-hardware" aria-hidden="true"><span>ARES / EVA</span><i></i><i></i><i></i><b>IV</b></div>
      <div class="ares-screen"><header class="ares-header"><b><i></i> ARES <span>MARK-IV</span></b><button type="button" class="ares-close" aria-label="Kolu indir">ESC ×</button></header>
      <div class="ares-location"><span data-ares-phase></span><time data-ares-clock></time></div>
      <nav class="ares-tabs" aria-label="Terminal ekranları">${['DURUM', 'YAŞAM DESTEĞİ', 'SEYİR', 'MÜRETTEBAT'].map((name, index) => `<button type="button" data-ares-tab="${index}" aria-pressed="${index === 0}">${name}</button>`).join('')}</nav>
      <p class="ares-notice" aria-live="polite"></p><div class="ares-content"></div><div class="ares-panel-slot" hidden></div><footer class="ares-footer"><span>TAB · TABLETİ KAPAT</span><span>TEKERLEK · SAYFA</span><b data-ares-page>01 / 04</b></footer></div>
      <div class="ares-case-label" aria-hidden="true">EVA · GÖREV TERMİNALİ <span>ARES—01</span></div>
    </section>
    <img class="ares-grip ares-grip-front" src="${artBase}eva-tablet-grip-front.svg" alt="" aria-hidden="true" draggable="false" width="900" height="620">
    </div></div>`;
  root.append(host);
  const arm = host.querySelector('.ares-arm'), content = host.querySelector('.ares-content');
  const phase = host.querySelector('[data-ares-phase]'), clock = host.querySelector('[data-ares-clock]');
  const page = host.querySelector('[data-ares-page]'), tabs = [...host.querySelectorAll('[data-ares-tab]')];
  let raised = false, screen = 0, disposed = false, timer = null, noticeTimer=null, lastMarkup = '';
  const notice=host.querySelector('.ares-notice');
  const removers = [];
  const on = (target, type, handler, options) => {
    const listenerOptions = typeof options === 'boolean' ? { capture: options } : options;
    target.addEventListener(type, handler, listenerOptions);
    removers.push(() => target.removeEventListener(type, handler, listenerOptions));
  };
  function update() {
    if (!raised || disposed) return;
    const data = getData();host.setAttribute('data-light',data?.mode==='colony'?'mars':'cabin');
    const markup = data ? screenMarkup(data, screen) : '<p class="ares-note">Telemetri bağlantısı bekleniyor.</p>';
    if (markup !== lastMarkup) { content.innerHTML = markup; lastMarkup = markup; }
    phase.textContent = data?.mode === 'colony' ? `JEZERO · SOL ${format(data.sol, 0)}` : data?.phaseLabel ?? 'VERİ BEKLENİYOR';
    // Samet's live clock remains a clearly labelled Earth UTC clock, separate from MET / LMST.
    clock.textContent = `UTC ${new Date().toISOString().slice(11, 19)}`;
    tabs.forEach((tab,i)=>tab.textContent=(data?.mode==='colony'?['GENEL BAKIŞ','SU & OKSİJEN','ENERJİ','MÜRETTEBAT']:['DURUM','YAŞAM DESTEĞİ','SEYİR','MÜRETTEBAT'])[i]);
  }
  function setRaised(value, notify = false) {
    if (disposed || raised === Boolean(value)) return;
    win.clearTimeout(noticeTimer);host.classList.remove('is-peeking');
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
    const close = event.key === 'Escape' || event.code === 'Escape';
    const tab = event.key === 'Tab' || event.code === 'Tab';
    if (editable && !close || event.metaKey || event.ctrlKey) return;
    if (!(tab || raised && close)) return;
    // Capture before the flight's old Q action and the colony document-level FPS bindings.
    // Pointer lock is deliberately retained: Alt/Q/Tab work entirely from the keyboard.
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return;
    if (tab) toggle();
    else if (close) setRaised(false, true);

  }, true);
  on(win, 'wheel', event => {
    if (!raised) return;
    if(event.target?.closest?.('.ares-content,.ares-panel-slot,.ares-colony-actions'))return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.deltaY) selectPage(screen + Math.sign(event.deltaY));
  }, { capture: true, passive: false });
  on(host.querySelector('.ares-close'), 'click', () => setRaised(false, true));
  tabs.forEach((tab, index) => on(tab, 'click', () => selectPage(index)));
  return {
    toggle, setRaised, update,
    notify(message){if(disposed||!message)return;notice.textContent=message;win.clearTimeout(noticeTimer);host.classList.add('has-notice');if(!raised){host.classList.add('is-peeking');host.setAttribute('aria-hidden','false');}noticeTimer=win.setTimeout(()=>{host.classList.remove('is-peeking','has-notice');if(!raised)host.setAttribute('aria-hidden','true');},3800);},
    get raised() { return raised; },
    get screen() { return screen; },
    dispose() {
      if (disposed) return;
      disposed = true; win.clearInterval(timer);win.clearTimeout(noticeTimer);
      removers.forEach(remove => remove()); host.remove();
    },
  };
}
