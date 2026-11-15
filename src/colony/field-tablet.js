import {GALE_SURFACE_SV_PER_SECOND,GALE_SURFACE_GY_PER_SECOND,MSL_TRANSIT_SV_PER_SECOND} from '../sim/marsRadiation.js';
import {DAY} from '../sim/constants.js';
import {MARS_SOL_SECONDS} from '../sim/marsSun.js';
import {analysisSnapshot,analyzeWithLocalModel,currentFinding,localModels} from './local-analysis.js';

const format=value=>Number.isFinite(value)?value.toLocaleString('tr-TR',{maximumFractionDigits:2}):'—';

export function mountFieldTablet({getDetail,onOpen}) {
  const panel=document.createElement('section');
  panel.className='colony-drawer field-tablet';
  panel.hidden=true;
  panel.innerHTML=`
    <h2>Saha analizi</h2>
    <nav aria-label="Saha analizi ekranları">
      <button type="button" data-field-page="radiation">Radyasyon</button>
      <button type="button" data-field-page="vision">Görüntü</button>
      <button type="button" data-field-page="ai">Yerel yapay zekâ</button>
    </nav>
    <section data-field-section="radiation">
      <h3>Kişisel dozimetre</h3>
      <p data-zone></p>
      <dl class="sc-readouts">
        <dt>Doz eşdeğeri hızı</dt><dd data-rate>—</dd>
        <dt>Emilen doz hızı</dt><dd data-absorbed-rate>—</dd>
        <dt>Biriken doz eşdeğeri</dt><dd data-dose>—</dd>
        <dt>Biriken emilen doz</dt><dd data-absorbed-dose>—</dd>
      </dl>
      <p>Curiosity RAD, Gale Krateri · ${format(GALE_SURFACE_SV_PER_SECOND*DAY*1000)} mSv ve ${format(GALE_SURFACE_GY_PER_SECOND*DAY*1000)} mGy / 24 sa. Curiosity seyir referansı ${format(MSL_TRANSIT_SV_PER_SECOND*DAY*1000)} mSv / 24 sa.</p>
      <p>Jezero için gösterilen dozlar simülasyondur. Habitat koruması %50 oyun varsayımıdır.</p>
      <a href="https://ntrs.nasa.gov/citations/20240009831" target="_blank" rel="noopener">NASA RAD ölçümleri</a>
    </section>
    <section data-field-section="vision" hidden>
      <h3>Sahne görüntüsü</h3>
      <button type="button" data-capture>Görüntüyü tara</button><p data-capture-status role="status"></p>
      <div class="field-frame" data-frame hidden><img alt="Mars oyun kamerasından alınan analiz karesi"><dl class="sc-readouts">
        <dt>Ortalama parlaklık</dt><dd data-metric="brightness"></dd>
        <dt>Kontrast aralığı</dt><dd data-metric="contrast"></dd>
        <dt>Karanlık piksel alanı</dt><dd data-metric="darkArea"></dd>
        <dt>Belirgin kenar alanı</dt><dd data-metric="edgeArea"></dd>
      </dl></div>
      <p>Bu ölçümler oyun kamerasının son taramasına aittir. Panellere düşen toz miktarı elektrik telemetrisinden okunur.</p>
    </section>
    <section data-field-section="ai" hidden>
      <h3>KERK görev danışmanı</h3>
      <p>Ollama, su, oksijen, enerji ve radyasyon değerleriyle isteğe bağlı son görüntü ölçümlerini yorumlar.</p>
      <form class="field-ai">
        <label>Yerel model <select aria-label="Yerel model" required></select></label>
        <button type="button" data-refresh>Modelleri yenile</button>
        <label class="field-question">Görev sorusu <input type="text" maxlength="220" placeholder="Kolonide önce neye dikkat etmeliyim?"></label>
        <button type="submit" disabled>Durumu analiz et</button><button type="button" data-cancel hidden>İptal et</button>
      </form>
      <p data-finding hidden></p>
      <p data-ai-status role="status"></p><p class="field-answer" data-answer hidden></p>
    </section>`;
  document.body.append(panel);
  const abort=new AbortController();
  const find=selector=>panel.querySelector(selector);
  const listen=(target,type,fn)=>target.addEventListener(type,fn,{signal:abort.signal});
  const model=find('select'), form=find('form'), submit=find('[type="submit"]'), cancel=find('[data-cancel]');
  const aiStatus=find('[data-ai-status]'), answer=find('[data-answer]');
  const capture=find('[data-capture]'), captureStatus=find('[data-capture-status]');
  let frame, pending, captureTimer, activePage, modelsLoaded=false;

  function refreshRadiation(){
    const dose=getDetail().lifeSupport?.radiation;
    if(!dose)return;
    const astronaut=(getDetail().state?.crew??[]).findIndex(person=>person.id===dose.crewId)+1;
    find('[data-zone]').textContent=`Astronot ${astronaut||'—'} · ${dose.sheltered?'Habitat':'Yüzey referansı'}`;
    find('[data-rate]').textContent=`${format(dose.equivalentSvPerSecond*3.6e9)} µSv/sa · ${format(dose.equivalentSvPerSecond*MARS_SOL_SECONDS*1000)} mSv/sol`;
    find('[data-absorbed-rate]').textContent=format(dose.absorbedGyPerSecond*3.6e9)+' µGy/sa';
    find('[data-dose]').textContent=format(dose.equivalentSv*1e6)+' µSv';
    find('[data-absorbed-dose]').textContent=format(dose.absorbedGy*1e6)+' µGy';
  }

  async function refreshModels(){
    const refresh=find('[data-refresh]');
    refresh.disabled=true;
    submit.disabled=true;
    aiStatus.textContent='Yerel Ollama aranıyor…';
    try{
      const selected=model.value;
      const models=await localModels(AbortSignal.any([abort.signal,AbortSignal.timeout(3500)]));
      model.replaceChildren(...models.map(name=>new Option(name,name)));
      if(models.includes(selected))model.value=selected;
      else if(models.includes('llama3.2:latest'))model.value='llama3.2:latest';
      modelsLoaded=models.length>0;
      aiStatus.textContent=modelsLoaded?'Ollama bağlı · Bu bilgisayar':'Ollama’da kullanılabilir yerel model bulunamadı.';
    }catch{
      modelsLoaded=false;
      aiStatus.textContent='Ollama bağlantısı kurulamadı. Ollama çalışırken yerel oyun adresinden yeniden dene.';
    }finally{
      refresh.disabled=false;
      submit.disabled=!modelsLoaded||Boolean(pending);
    }
  }

  function selectPage(page){
    activePage=page;
    for(const button of panel.querySelectorAll('[data-field-page]'))button.setAttribute('aria-pressed',String(button.dataset.fieldPage===page));
    for(const section of panel.querySelectorAll('[data-field-section]'))section.hidden=section.dataset.fieldSection!==page;
    if(page==='radiation')refreshRadiation();
    if(page==='ai'&&!modelsLoaded&&!find('[data-refresh]').disabled)void refreshModels();
  }

  for(const button of panel.querySelectorAll('[data-field-page]'))listen(button,'click',()=>selectPage(button.dataset.fieldPage));
  listen(window,'colony:state',()=>{if(!panel.hidden&&activePage==='radiation')refreshRadiation();});
  listen(capture,'click',()=>{
    capture.disabled=true;
    captureStatus.textContent='Kamera karesi ölçülüyor…';
    clearTimeout(captureTimer);
    captureTimer=setTimeout(()=>{
      capture.disabled=false;
      captureStatus.textContent='Kamera karesi alınamadı. Yeniden dene.';
    },8000);
    window.dispatchEvent(new CustomEvent('colony:capture-frame'));
  });
  listen(window,'colony:frame-analysis',event=>{
    clearTimeout(captureTimer);
    capture.disabled=false;
    if(!event.detail){
      captureStatus.textContent='Kamera karesi işlenemedi.';
      return;
    }
    frame=event.detail.metrics;
    const preview=find('[data-frame]');
    preview.querySelector('img').src=event.detail.preview;
    preview.hidden=false;
    for(const [key,value] of Object.entries(frame))find(`[data-metric="${key}"]`).textContent='%'+format(value);
    captureStatus.textContent='Tarama tamamlandı.';
  });

  listen(find('[data-refresh]'),'click',refreshModels);
  listen(cancel,'click',()=>pending?.abort());
  listen(form,'submit',async event=>{
    event.preventDefault();
    if(pending||!modelsLoaded||!model.value)return;
    pending=new AbortController();
    submit.disabled=model.disabled=find('[data-refresh]').disabled=true;
    cancel.hidden=false;
    answer.hidden=true;
    answer.textContent='';
    aiStatus.textContent='Yerel model hazırlanıyor…';
    const telemetry=analysisSnapshot(getDetail(),frame);
    const finding=currentFinding(telemetry);
    const evidence=find('[data-finding]');
    evidence.textContent=finding.fact+' '+finding.action;
    evidence.hidden=false;
    try{
      await analyzeWithLocalModel({
        model:model.value,question:find('input').value.trim(),
        telemetry,signal:pending.signal,
        onText:text=>{if(text){answer.hidden=false;answer.textContent=text;aiStatus.textContent='Yerel model yanıtlıyor…';}},
      });
      aiStatus.textContent='Analiz tamamlandı · '+model.value;
      if(!panel.hidden&&activePage==='ai')answer.scrollIntoView({block:'nearest'});
    }catch(error){
      aiStatus.textContent=pending.signal.aborted?'Analiz iptal edildi.':error.name==='TimeoutError'?
        'Yerel model zamanında yanıt vermedi. Yeniden deneyebilirsin.':'Yerel model yanıtı alınamadı. Ollama’yı kontrol et.';
    }finally{
      pending=null;
      submit.disabled=model.disabled=find('[data-refresh]').disabled=false;
      cancel.hidden=true;
    }
  });
  return {
    open(page){onOpen(panel);selectPage(page);},
    dispose(){abort.abort();pending?.abort();clearTimeout(captureTimer);panel.remove();},
  };
}
