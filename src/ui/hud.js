import { G0, DAY, AU } from '../sim/constants.js';
import { SLS } from '../data/sls.js';
import { saveLandingPayload, clearLandingPayload } from '../colony/handoff.js';
import { landingSequence } from '../render/landingSequence.js';
import { apsisReadout, vehicleConfiguration, missionCalendar, missionElapsed, EVENT_CAPTIONS } from './presentation.js';
import { mountWristTerminal } from './wristTerminal.js';
import { flightWristData } from './wristData.js';
const CAMERAS=['Takip','Kabin / iniş penceresi','Yer takibi','Motor kamerası','Sinematik','Yörünge haritası'];

export function formatMET(seconds){const t=Math.floor(Math.abs(seconds)+1e-6),days=Math.floor(t/DAY);return `${seconds<0?'T−':'T+'} ${days?`${days}g `:''}${String(Math.floor(t/3600)%24).padStart(2,'0')}:${String(Math.floor(t/60)%60).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}
const number=(n,d=1)=>Number.isFinite(n)?n.toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
// INIS: presentation only; callouts read SI telemetry and sim event times.
export function landingCallout(t) {
  if(t.phase==='LANDED')return '';
  if(t.phase!=='EDL')return '';
  const age=id=>{const e=t.events.find(e=>e.type===id);return e?t.missionTime-e.time:Infinity;};
  if(t.altitude<10)return 'Temas bekleniyor · İniş motorları nominal';
  if(t.altitude<30)return 'İrtifa 30 m altı · Yüzey tozu · İniş sahası görüşte';
  if(age('LEGS_DEPLOYED')<3)return 'İrtifa 1000 m · İniş bacakları açılıyor';
  if(age('LEGS_DEPLOYED')<7)return 'Bacaklar açıldı · Kilitler doğrulandı';
  if(age('HEATSHIELD_JETTISON')<4)return 'Isı kalkanı ayrıldı · Süpersonik retropropulsiyon';
  if(t.engineFiring)return `Motorlu iniş · Radar irtifası ${number(t.altitude,0)} m`;
  return t.heatFlux>2000?'Atmosferik frenleme · Isı kalkanı yük altında':'Mars atmosferine giriş';
}
// END INIS callouts.

export function createHUD(commands){
  const root=document.getElementById('hud');
  root.innerHTML=`
    <header class="topbar"><div class="identity"><span class="mission-mark">M<span>01</span></span><div><b>MARS’A İLK KOLONİ</b><small>ARTEMIS / ÖNCÜ MÜRETTEBAT GÖREVİ</small></div></div><div class="phase"><span class="live-dot"></span><span id="phase">Kalkış hazırlığı</span></div><div class="clock"><small>Uzayda geçirilen süre</small><strong id="met">T+ 0 sa 0 dk 0 sn</strong><div class="pacing-controls"><span id="playback-rate">Gösterim ×1 · otomatik</span><button hidden id="auto-btn" title="R / Sinematik akışı aç veya kapat">Otomatik akış: AÇIK</button><button hidden id="warp-btn" title="T / Manuel hız · Basılı tut: otomatik akış">×1</button></div></div></header>
    <div id="event-caption" role="status" aria-live="polite" hidden></div>
    <section class="telemetry instrument"><div class="section-label">UÇUŞ TELEMETRİSİ <span>CANLI</span></div><div class="main-value"><small id="alt-label">İRTİFA</small><strong id="alt">0,0</strong><span id="alt-unit">km</span><div class="micro-line"></div></div><div class="main-value"><small id="velocity-label">YÜZEYE GÖRE HIZ</small><strong id="vel">0,00</strong><span>km/s</span></div><dl class="data-rows"><div><dt>Düşey hız</dt><dd id="vs">0 m/s</dd></div><div><dt>Mach</dt><dd id="mach">0,00</dd></div><div id="q-row"><dt>Dinamik basınç</dt><dd id="q">0 kPa</dd></div><div><dt>G yükü</dt><dd id="g">1,00 g</dd></div><div><dt>Uçuş yolu açısı</dt><dd id="gamma">90°</dd></div></dl><div id="maxq" class="flag" hidden>TEPE BASINÇ · AERODİNAMİK YÜK</div><div class="attitude"><div class="attitude-ring"><div id="horizon"></div><span>+</span></div><div><small>YÖNLENDİRME</small><b id="guidance">OTOPİLOT</b><small id="thermal">GNC / NOMİNAL</small></div></div></section>
    <section class="vehicle-panel instrument"><div class="section-label">ARAÇ SİSTEMLERİ <span id="stage-name">SLS B1</span></div><div class="stack-layout"><div id="stack-drawing" class="stack-drawing"><i class="las"></i><i class="capsule"></i><i class="upper"></i><i class="core"></i><i class="booster left"></i><i class="booster right"></i><i class="engine"></i><i class="solar left"></i><i class="solar right"></i><i class="leg left"></i><i class="leg right"></i></div><div class="fuel-stack">${['icps','core','srb'].map(id=>`<div class="fuel" id="fuel-${id}"><div><b id="fuel-label-${id}">${id.toUpperCase()}</b><span id="fuel-value-${id}">100%</span></div><div class="bar"><i id="fuel-bar-${id}"></i></div><small id="fuel-status-${id}">BAĞLI</small></div>`).join('')}</div></div><div class="throttle"><span>GAZ KOLU</span><b id="throttle">100%</b><div class="bar"><i id="throttle-bar"></i></div></div><div class="engine-status"><span id="engine-label">RS-25 / 4</span><div>${Array.from({length:6},(_,i)=>`<i id="engine-${i}"></i>`).join('')}</div></div><div class="crew-status"><span>YAŞAM DESTEĞİ</span><b>03 / MÜRETTEBAT</b><small id="supplies">O₂ · SU · GIDA NOMİNAL</small></div></section>
    <div class="view-caption"><span id="camera-name" hidden>01 / TAKİP</span><small id="location">KENNEDY UZAY MERKEZİ / LC-39B</small></div>
    <div id="map-legend" hidden><span class="legend-solid"></span>İzlenen yol <span class="legend-dashed"></span>Öngörülen yörünge</div>
    <section id="launch-card" aria-label="Ana menü"><div class="title-eyebrow">İNSANLI MARS GÖREVİ / 01</div><h1>Dünya’dan<br><em>Mars’a</em></h1><p class="title-subtitle">MARS’A İLK KOLONİ</p><div class="title-rule"></div><p class="title-intro">Üç insan. İki gezegen.<br>Birlikte yazılacak yeni bir başlangıç.</p>
      <!-- BOLUM: preserve the colony button ID and its existing handoff behaviour. -->
      <div class="title-actions"><button id="start-btn" disabled>Bölüm 1 · Dünya'dan kalkış <span>↗</span></button><button id="landing-chapter" disabled>Bölüm 2 · Mars'a iniş <span>↗</span></button><button id="colony-chapter">Bölüm 3 · Mars kolonisi <span>↗</span></button><div class="title-utilities"><button id="title-controls">Kontroller <span>H</span></button><button id="about-btn">Hakkında / Kaynaklar <span>↗</span></button></div></div>
      <!-- END BOLUM. -->
      <span id="loading">NASA varlıkları hazırlanıyor…</span><div class="title-team">EMRE · İHAN · SAMET <span>2026</span></div></section>
    <div id="about-overlay" class="overlay" hidden><section class="dialog"><small>GÖREVİN ARKASINDA</small><h2>Bilimden ilham alan bir ilk adım.</h2><p class="about-intro">Mars'a İlk Koloni · NASA Space Apps 2026<br>Space Mission Design · Görev tasarım oyunu</p><div class="team-cards"><p><b>Emre</b><span>Fırlatma, uçuş ve Mars inişi</span></p><p><b>İhan</b><span>Koloni ve kaynak yönetimi</span></p><p><b>Samet</b><span>Entegrasyon, arayüz ve demo</span></p></div><h3>Veri ve görsel kaynaklar</h3><ul class="sources"><li><a href="https://ssd.jpl.nasa.gov/astro_par.html" target="_blank" rel="noopener">NASA / JPL</a> · Gezegenler ve astronomi sabitleri</li><li><a href="https://ntrs.nasa.gov/citations/19770009539" target="_blank" rel="noopener">US Standard Atmosphere 1976</a> · Dünya atmosfer modeli</li><li><a href="https://www.grc.nasa.gov/www/k-12/airplane/atmosmrm.html" target="_blank" rel="noopener">NASA Glenn</a> · Mars atmosfer modeli</li><li><a href="https://ntrs.nasa.gov/citations/20150002905" target="_blank" rel="noopener">NASA BVAD</a> · Mürettebat yaşam desteği</li><li><a href="https://science.nasa.gov/3d-resources/" target="_blank" rel="noopener">NASA 3D Resources</a> · SLS, Orion ve astronot modeli</li><li>NASA Blue Marble / Black Marble · Dünya yüzeyi ve gece ışıkları</li><li>NASA / JPL / USGS Viking MDIM · Mars yüzeyi</li><li>NASA SVS / ESA Gaia · Yıldız haritası; Barlow · OFL yazı tipleri</li></ul><p class="muted">İki cisimli yörüngeler ve Hohmann transferi kullanılır. Transit aracı, insanlı Mars iniş aracı ve yerel arazi oyun konseptidir. Tam kaynak ve lisans kaydı: ASSETS.md · docs/PHYSICS.md. NASA onayı iddia edilmez.</p><button id="about-close">Ana menüye dön</button></section></div>
    <div id="countdown-banner" hidden><small>TERMİNAL GERİ SAYIM</small><strong id="countdown-number">10</strong><span id="countdown-status">FIRLATMA İZNİ VERİLDİ</span></div>
    <div class="center-message" id="notice" role="status"></div><button id="colony-btn" class="mission-action colony-action" hidden>KOLONİYİ KUR ↗</button><button id="burn-btn" class="mission-action" hidden>B / TRANSFER ATEŞLEMESİNİ BAŞLAT ↗</button>
    <!-- INIS: pointer-transparent landing chapter fade; fallback remains clickable. -->
    <!-- END INIS landing chapter fade. -->
    <footer class="bottom"><div class="orbit-strip"><span>YÖRÜNGE ÇÖZÜMÜ</span><span><em id="ap-label">AP</em> <b id="apo">—</b> <small id="ap-unit">km</small></span><span><em id="pe-label">PE</em> <b id="peri">—</b> <small id="pe-unit">km</small></span><span id="extra-metric">LC-39B / 28,627° K</span></div><div class="timeline" id="timeline" hidden></div><nav class="camera-nav" aria-label="Kameralar">${CAMERAS.map((name,i)=>`<button data-camera="${i}" title="${i+1} / ${name}"><kbd>${i+1}</kbd>${name}</button>`).join('')}<button id="watch-btn">TAB / TABLET</button><button id="help-btn" class="help-button">H / KONTROLLER</button><button id="pause-btn" aria-label="Duraklat">Ⅱ</button></nav></footer>
    <div id="help-overlay" class="overlay" hidden><section class="dialog"><small>UÇUŞ EL KİTABI</small><h2>Görev sizin kontrolünüzde.</h2><div class="help-grid"><p><kbd>Boşluk / E</kbd>Geri sayım / güvenli kademe atımı</p><p><kbd>C / 1–6</kbd>Kamera değiştir / seç</p><p><kbd>Fare / Tekerlek</kbd>Takip kamerasını döndür / yakınlaştır</p><p><kbd>B</kbd>Park yörüngesinde manevra başlat</p><p><kbd>, / . / T</kbd>Zamanı yavaşlat / hızlandır</p><p><kbd>R</kbd>Sinematik akışı aç / kapat</p><p><kbd>A</kbd>Manuel gaz kolu / otopilot</p><p><kbd>Shift / Ctrl · Z / X</kbd>Gaz artır / azalt · tam / kes</p><p><kbd>M · F</kbd>Sesi kapat · tam ekran</p><p><kbd>Esc / P</kbd>Duraklat / devam et</p><p><kbd>H</kbd>Bu rehberi aç / kapat</p><p><kbd>Q</kbd>Kol bilgisayarını aç / kapat</p></div><p class="muted">Atmosferde ve motor yanarken en fazla 10×. Varsayılan yönlendirme otopilottur; Mars inişi otomatik yapılır.</p><button id="help-close">ANLAŞILDI / H</button></section></div>
    <div id="pause-overlay" class="overlay" hidden><section class="dialog pause-dialog"><small>GÖREV BEKLEMEDE</small><h2>Uçuş duraklatıldı.</h2><label>Görüntü kalitesi<select id="quality"><option>Düşük</option><option selected>Orta</option><option>Yüksek</option></select></label><label class="check">Uyarlanabilir kalite<input id="adaptive" type="checkbox" checked></label><label>Ana ses<input id="volume" type="range" min="0" max="1" value=".4" step=".01"></label><button id="mute-btn">M / SESİ KAPAT</button><div class="pause-actions"><button id="resume-btn">UÇUŞA DEVAM ET ↗</button><button id="reset-btn" class="secondary">GÖREVİ SIFIRLA</button></div><p id="performance" class="muted"></p></section></div>
  `;
  const nodes=Object.fromEntries([...root.querySelectorAll('[id]')].map(n=>[n.id,n])),listeners=[];
  const on=(node,event,fn)=>{node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn));};
  const bind=(id,fn)=>on(nodes[id],'click',fn);
  // INIS: every transition uses exactly the existing flight payload/storage contract.
  let latest=null,departing=false,landingViewQueued=false,handoffFailed=false;
  const handoff=()=>{
    if(departing||latest?.phase!=='LANDED'||!latest.landingPayload)return;
    let saved=false;
    try { saved=saveLandingPayload(latest.landingPayload); } catch { /* blocked session storage */ }
    if(!saved){
      handoffFailed=true;
      text('notice','İniş verisi kaydedilemedi · Oturum depolamasını etkinleştirip KOLONİYİ KUR ile yeniden deneyin');
      return;
    }
    handoffFailed=false;departing=true;location.href='colony.html';
  };
  bind('colony-btn',handoff);
  on(window,'keydown',event=>{
    if(latest?.phase!=='LANDED'||landingSequence.paused||event.repeat||event.altKey||event.ctrlKey||event.metaKey||/INPUT|TEXTAREA|SELECT/.test(event.target?.tagName))return;
    if(event.code==='Enter'||event.code==='Space'){event.preventDefault();handoff();}
  });
  // END INIS handoff.

  // ARES integration: terminal owns Tab/Esc; preserve ui.watch for automation and host commands.
  const wrist=mountWristTerminal({root,getData:()=>latest?flightWristData(latest):null,onToggle:()=>{if(latest)commands.watch();}});
  bind('colony-chapter',()=>{clearLandingPayload();location.href='colony.html';});
  // BOLUM: use the same command surface as automated chapter selection.
  bind('landing-chapter',()=>commands.startChapter('mars-orbit'));
  let warpHold,warpHeld=false;
  const cancelWarpHold=()=>{clearTimeout(warpHold);warpHold=undefined;};
  on(nodes['warp-btn'],'pointerdown',()=>{warpHeld=false;cancelWarpHold();warpHold=setTimeout(()=>{warpHeld=true;commands.automatic();},550);});
  for(const event of ['pointerup','pointerleave','pointercancel'])on(nodes['warp-btn'],event,cancelWarpHold);
  listeners.push(cancelWarpHold);
  bind('start-btn',()=>commands.startChapter('launch'));bind('title-controls',commands.help);bind('about-btn',commands.about);bind('about-close',commands.about);bind('watch-btn',commands.watch);bind('burn-btn',commands.burn);bind('warp-btn',()=>{if(!warpHeld)commands.warp(1);warpHeld=false;});bind('auto-btn',commands.automatic);bind('help-btn',commands.help);bind('help-close',commands.help);bind('pause-btn',commands.pause);bind('resume-btn',commands.pause);bind('reset-btn',commands.reset);bind('mute-btn',commands.mute);
  root.querySelectorAll('[data-camera]').forEach(b=>on(b,'click',()=>commands.camera(Number(b.dataset.camera))));
  on(nodes.quality,'change',()=>commands.quality(nodes.quality.value,nodes.adaptive.checked));on(nodes.adaptive,'change',()=>commands.quality(nodes.quality.value,nodes.adaptive.checked));on(nodes.volume,'input',()=>commands.volume(Number(nodes.volume.value)));
  let eventKey='',caption='',captionUntil=0,lastCaptionTime=-1,seenEvents=new Set();
  const text=(id,value)=>{if(nodes[id].textContent!==value)nodes[id].textContent=value;};
  return {ready(failures){nodes['start-btn'].disabled=false;nodes['landing-chapter'].disabled=false;text('loading',failures.length?'Sistemler hazır / doku yedeği aktif':'Tüm uçuş sistemleri hazır');},progress(done,total){text('loading',`NASA VARLIKLARI / ${done} / ${total}`);},
    update(t,ui){
      const launch=['PRELAUNCH','ASCENT'].includes(t.phase),stacked=launch||t.phase==='PARKING_ORBIT',cd=t.countdown;
      text('phase',missionCalendar(t));text('met',`${number(Math.max(0,t.missionTime)/86400,1)} gün`);text('warp-btn',`×${number(ui.warp,0)}`);
      const automatic=ui.pacing?.mode!=='manual';
      text('playback-rate',`Gösterim ×${number(ui.warp,ui.warp<10?1:0)} · ${automatic?'otomatik':'manuel'}`);
      text('auto-btn',`Otomatik akış: ${automatic?'AÇIK':'KAPALI'}`);nodes['auto-btn'].setAttribute('aria-pressed',String(automatic));
      const now=performance.now();
      if(t.missionTime<lastCaptionTime||ui.title){seenEvents.clear();caption='';captionUntil=0;}
      const captionEvents=[...t.events];
      if(t.maxQ?.time>0&&(t.time??0)>t.maxQ.time+1)captionEvents.push({type:'MAX_Q',time:t.maxQ.time});
      for(const event of captionEvents){
        const key=`${event.type}:${event.time}`;
        if(seenEvents.has(key))continue;
        seenEvents.add(key);
        if(EVENT_CAPTIONS[event.type]&&t.missionTime-event.time<Math.max(3,ui.warp*.15)){caption=EVENT_CAPTIONS[event.type];captionUntil=now+4500;}
      }
      lastCaptionTime=t.missionTime;
      text('event-caption',caption);nodes['event-caption'].hidden=ui.title||!caption||now>captionUntil;
      text('alt',number((t.altitude??0)/1000,t.altitude<1000?3:1));text('vel',number((t.surfaceVelocity??t.velocity??t.heliocentric.speed)/1000,2));text('velocity-label',t.phase==='CRUISE'?'GÜNEŞ’E GÖRE HIZ':t.surfaceVelocity!==undefined?'YÜZEYE GÖRE HIZ':'YÖRÜNGE HIZI');
      text('alt-label',t.phase==='CRUISE'?'GÜNEŞ’E UZAKLIK':'İRTİFA');text('alt-unit',t.phase==='CRUISE'?'AU':'km');
      if(t.phase==='CRUISE')text('alt',number(Math.hypot(...t.heliocentric.ship)/AU,3));
      text('vs',`${number(t.verticalSpeed??0,0)} m/s`);text('mach',number(t.mach,2));text('q',`${number((t.dynamicPressure??0)/1000,2)} kPa`);text('g',`${number((t.acceleration??0)/G0,2)} g`);text('gamma',`${number((t.flightPathAngle??Math.PI/2)*180/Math.PI,1)}°`);
      const maxq=launch&&(t.dynamicPressure??0)>27000;nodes.maxq.hidden=!maxq;nodes['q-row'].classList.toggle('warning',maxq);
      text('guidance',ui.manual?'MANUEL GAZ KOLU':'OTOPİLOT');text('thermal',t.phase==='EDL'?`ISI AKISI / ${number((t.heatFlux??0)/1000,0)} kW/m²`:'YÖNLENDİRME / NOMİNAL');nodes.horizon.style.transform=`rotate(${90-(t.pitch??Math.PI/2)*180/Math.PI}deg)`;
      for(const stage of SLS.stages){const s=t.stages.find(s=>s.id===stage.id);let fuel=s.attached?s.propellant/stage.propellantMass:0,name=stage.id==='core'?'ANA':stage.id.toUpperCase(),status=s.attached?'BAĞLI':'AYRILDI';
        if(!stacked){fuel=stage.id==='icps'?t.transitPropellant/120000:stage.id==='core'?typeof t.propellant==='number'?t.propellant/16000:1:t.supplies.oxygen/806.4;name=stage.id==='icps'?'NTR':stage.id==='core'?'İNİŞ':'ERZAK';status=stage.id==='icps'?'TRANSİT':stage.id==='core'?t.mars?'İNİŞ ARACI':'HAZIR':'YAŞAM DESTEĞİ';}
        text(`fuel-label-${stage.id}`,name);text(`fuel-value-${stage.id}`,`${number(fuel*100,0)}%`);nodes[`fuel-bar-${stage.id}`].style.width=`${Math.max(0,Math.min(1,fuel))*100}%`;text(`fuel-status-${stage.id}`,status);nodes[`fuel-${stage.id}`].classList.toggle('separated',stacked&&!s.attached);
      }
      const configuration=vehicleConfiguration(t);
      nodes['stack-drawing'].className=`stack-drawing ${configuration}`;nodes['stack-drawing'].dataset.configuration=configuration;
      nodes['stack-drawing'].classList.toggle('no-las',!t.lasAttached);
      nodes['stack-drawing'].setAttribute('aria-label',({boosters:'Katı iticiler, ana kademe, ICPS ve Orion',core:'Ana kademe, ICPS ve Orion',upper:'ICPS ve Orion',transit:'Mars transit aracı',lander:'Mars iniş aracı'})[configuration]);
      const throttle=cd.running&&cd.time>=-6.5?Math.min(1,(cd.time+6.5)/5):t.engineFiring?(t.throttle??1):0;
      text('throttle',`${number(throttle*100,0)}%`);nodes['throttle-bar'].style.width=`${throttle*100}%`;
      const engineCount=configuration==='lander'?4:launch?(t.stages.find(s=>s.id==='core').attached?4:1):configuration==='upper'?0:3;
      for(let i=0;i<6;i++)nodes[`engine-${i}`].classList.toggle('on',i<engineCount&&throttle>0||i>=4&&t.phase==='ASCENT'&&t.stages.find(s=>s.id==='srb').attached);
      text('engine-label',configuration==='lander'?'İNİŞ MOTORU / 4':launch?(t.stages.find(s=>s.id==='core').attached?'RS-25 / 4':'RL10 / 1'):configuration==='upper'?'RL10 / BEKLEME':'NTR / TRANSİT');text('stage-name',({boosters:'SLS B1',core:'ANA / ICPS',upper:'ICPS / ORION',transit:'MARS TRANSİT',lander:'MARS İNİŞ ARACI'})[configuration]);
      text('supplies',`O₂ ${number(t.supplies.oxygen,0)} kg · SU ${number(t.supplies.water,0)} kg`);
      text('camera-name',`${String(ui.camera+1).padStart(2,'0')} / ${ui.cameraName.toLocaleUpperCase('tr-TR')}`);
      nodes['map-legend'].hidden=ui.camera!==5||ui.title;
      text('location',ui.camera===5?(t.phase==='CRUISE'?'GÜNEŞ MERKEZLİ / HOHMANN TRANSFERİ':'GEZEGEN MERKEZLİ / ÖNGÖRÜLEN YÖRÜNGE'):t.mars?'MARS · İNİŞ KORİDORU':t.altitude>120000?'DÜNYA / ALÇAK YÖRÜNGE':'KENNEDY UZAY MERKEZİ / LC-39B');
      if(['PARKING_ORBIT','TMI_BURN','CRUISE'].includes(t.phase))text('location','DÜNYA → MARS / 3D TRANSFER GÖRÜNÜMÜ');
      if(['MOI_BURN','MARS_ORBIT'].includes(t.phase))text('location','MARS / YAKALAMA VE PARK YÖRÜNGESİ');
      root.classList.toggle('title-screen',ui.title);nodes['launch-card'].hidden=!ui.title;nodes['countdown-banner'].hidden=!cd.running;
      text('countdown-number',String(Math.ceil(Math.abs(cd.time))).padStart(2,'0'));text('countdown-status',cd.time>=-6.5?'RS-25 MOTORLARI ÇALIŞIYOR':'FIRLATMA İZNİ VERİLDİ');
      nodes['burn-btn'].hidden=true;latest=t;nodes['colony-btn'].hidden=t.phase!=='LANDED'||!t.landingPayload||ui.title;text('burn-btn',t.phase==='PARKING_ORBIT'?'B / MARS TRANSFERİNİ BAŞLAT ↗':'B / MARS İNİŞİNİ BAŞLAT ↗');
      text('notice',landingCallout(t)||t.failureReason||ui.notice||'');
      // INIS: wall-clock cinematic; neither warp nor frozen post-touchdown MET changes it.
      landingSequence.paused=ui.paused;
      if(t.phase==='LANDED'){
        text('colony-btn','KOLONİYE GEÇ ↗');
        nodes['colony-btn'].style.zIndex='16';
        if(!landingViewQueued){landingViewQueued=true;queueMicrotask(()=>{if(latest?.phase==='LANDED')commands.camera(0);});}
        if(handoffFailed)text('notice','İniş verisi kaydedilemedi · Oturum depolamasını etkinleştirip KOLONİYİ KUR ile yeniden deneyin');
        if(landingSequence.complete&&!ui.paused&&!departing&&!handoffFailed)handoff();
      }else{landingViewQueued=false;departing=false;handoffFailed=false;}
      // END INIS cinematic.
      const ap=apsisReadout(t.apoapsis??(t.orbit?t.orbit.apoapsis-t.radius:NaN),t.orbit?.e,'apo'),pe=apsisReadout(t.periapsis??(t.orbit?t.orbit.periapsis-t.radius:NaN),t.orbit?.e,'peri');
      text('apo',ap.value);text('peri',pe.value);text('ap-label','AP');text('pe-label','PE');text('ap-unit',ap.unit);text('pe-unit',pe.unit);
      if(t.phase==='PRELAUNCH'){text('apo','—');text('peri','—');text('ap-unit','');text('pe-unit','');}
      if(t.phase==='CRUISE'){text('ap-label','DÜNYA');text('pe-label','MARS');text('ap-unit','AU');text('pe-unit','AU');text('apo',number(Math.hypot(...t.heliocentric.earth.map((v,i)=>v-t.heliocentric.ship[i]))/AU,3));text('peri',number(Math.hypot(...t.heliocentric.mars.map((v,i)=>v-t.heliocentric.ship[i]))/AU,3));}
      if(['EDL','LANDED'].includes(t.phase)){text('ap-label','TEPE ISI');text('pe-label','YAKIT');text('ap-unit','kW/m²');text('pe-unit','t');text('apo',number(t.peakHeating/1000,1));text('peri',number(t.propellant/1000,2));}
      text('extra-metric',t.phase==='CRUISE'?`SEYİR / ${number(t.cruiseProgress*100,1)}% · ${number((1-t.cruiseProgress)*t.transfer.duration/DAY,1)} GÜN KALDI`:t.phase==='EDL'?`ISI AKISI ${number((t.heatFlux??0)/1000,0)} kW/m²`:t.burnRemaining?`Δv KALAN / ${number(t.burnRemaining,0)} m/s`:`MÜRETTEBAT / 03 · ${ui.muted?'SES KAPALI':'SES AÇIK'}`);
      const milestones=launch?['RS25_START','LIFTOFF','MAX_Q','SRB_SEPARATION','LAS_JETTISON','MECO','ORBIT_INSERTION']:t.mars?['MOI_BURN','MARS_ORBIT','DEORBIT','EDL','HEATSHIELD_JETTISON','SRP_IGNITION','LEGS_DEPLOYED','TOUCHDOWN']:['ORBIT_INSERTION','TMI_BURN','CRUISE','MOI_BURN','MARS_ORBIT'];
      const events=[...t.events];if((t.maxQ?.time??0)>0&&(t.time??0)>t.maxQ.time+1)events.push({type:'MAX_Q',time:t.maxQ.time});
      const key=milestones.join()+events.map(e=>e.type).join();if(key!==eventKey){eventKey=key;const labels={RS25_START:'MOTOR ATEŞLEME',LIFTOFF:'KALKIŞ',MAX_Q:'TEPE BASINÇ',SRB_SEPARATION:'İTİCİ AYRILMA',LAS_JETTISON:'KULE ATIMI',MECO:'ANA MOTOR KESME',ORBIT_INSERTION:'YÖRÜNGE',TMI_BURN:'TRANSFER',CRUISE:'SEYİR',MOI_BURN:'YAKALAMA',MARS_ORBIT:'MARS YÖR.',DEORBIT:'YÖRÜNGEDEN ÇIKIŞ',EDL:'GİRİŞ',HEATSHIELD_JETTISON:'KALKAN AYRILDI',LEGS_DEPLOYED:'BACAKLAR',SRP_IGNITION:'İNİŞ MOTORU',TOUCHDOWN:'TEMAS'};nodes.timeline.innerHTML=milestones.map(id=>{const event=events.find(e=>e.type===id);return `<div class="event ${event?'complete':''}"><i></i><b>${labels[id]??id}</b><small>${event?formatMET(event.time).replace(/T[+−] /,''):'BEKLENİYOR'}</small></div>`;}).join('');}
      root.querySelectorAll('[data-camera]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.camera)===ui.camera)));
      nodes['about-overlay'].hidden=!ui.about;wrist.setRaised(ui.watch&&!ui.title);
      nodes['help-overlay'].hidden=!ui.help;nodes['pause-overlay'].hidden=!ui.paused;text('performance',`${ui.quality} kalite · ${number(ui.fps,0)} kare/sn · ${ui.pixelRatio.toFixed(2)}× piksel oranı`);text('mute-btn',ui.muted?'M / SESİ AÇ':'M / SESİ KAPAT');
    },dispose(){latest=null;wrist.dispose();for(const off of listeners)off();root.replaceChildren();}
  };
}
