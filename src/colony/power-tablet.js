import { GRID } from './ihan/power/mars-power.mjs';
import { MOXIE_TANK_KG, moxieTankFull } from './ihan/power/live-grid.mjs';

const format=value=>Number.isFinite(value)?value.toLocaleString('tr-TR',{maximumFractionDigits:3}):'—';
const read=(value,unit)=>format(value)+' '+unit;

function appendTable(root,headers,rows){
  const scroll=document.createElement('div');
  scroll.className='power-detail-table';
  const table=document.createElement('table');
  const head=table.createTHead().insertRow();
  for(const heading of headers){
    const th=document.createElement('th');
    th.scope='col';th.textContent=heading;head.append(th);
  }
  const body=table.createTBody();
  for(const values of rows){
    const tr=body.insertRow();
    for(const value of values)tr.insertCell().textContent=value;
  }
  scroll.append(table);
  root.append(scroll);
}

export function mountPowerTablet(onOpen){
  const panel=document.createElement('section');
  panel.className='colony-drawer';panel.hidden=true;
  panel.innerHTML='<h2>Elektrik ve enerji tüketimi</h2><div data-readings></div><h3>Şebeke ayarları</h3><div data-controls></div><button data-report>İki sondaj kararını karşılaştır</button><div data-results></div>';
  document.body.append(panel);
  const controller=new AbortController();
  const on=(node,type,fn)=>node.addEventListener(type,fn,{signal:controller.signal});
  const command=(key,value)=>window.dispatchEvent(new CustomEvent('colony:power-command',{detail:{key,value}}));
  let latest;
  const controls=panel.querySelector('[data-controls]');
  for(const [key,label] of [['closed','Tesis şalteri'],['drill','Sondaj'],['blackStart','İlk gece arıza tatbikatı']]){
    const button=document.createElement('button');
    button.type='button';button.dataset.control=key;button.textContent=label;
    on(button,'click',()=>command(key,!latest?.controls[key]));
    controls.append(button);
  }
  const select=document.createElement('select');
  select.setAttribute('aria-label','Tahmin mevsimi');
  for(const [value,label] of [[0,'Ekinoks'],[90,'Kuzey yazı'],[180,'Sonbahar'],[270,'Kuzey kışı']]){
    const option=document.createElement('option');option.value=value;option.textContent='Tahmin · '+label;select.append(option);
  }
  on(select,'change',()=>command('season',Number(select.value)));
  controls.append(select);
  const sweep=document.createElement('button');
  sweep.type='button';sweep.textContent='Silecekleri çalıştır';
  const sweepStatus=document.createElement('p');
  sweepStatus.setAttribute('role','status');
  on(sweep,'click',()=>command('sweep'));
  on(window,'colony:sweep-status',event=>{sweepStatus.textContent=event.detail;});
  controls.after(sweep,sweepStatus);

  function render(){
    if(panel.hidden||!latest)return;
    for(const button of controls.querySelectorAll('button')){
      button.setAttribute('aria-pressed',String(latest.controls[button.dataset.control]));
    }
    if(document.activeElement!==select)select.value=latest.controls.season;
    const {live,state,flow}=latest;
    const root=panel.querySelector('[data-readings]');
    const scrollOffsets=[...root.querySelectorAll('.power-detail-table')].map(node=>node.scrollLeft);
    root.replaceChildren();
    const add=(tag,content)=>{
      const element=document.createElement(tag);element.textContent=content;root.append(element);
    };
    add('p',live?.recovering?'Acil şebeke':live?.daylight?'Gündüz · Güneş tarlası':'Gece · Batarya beslemesi');
    add('p','Güneş üretimi '+read(flow.solar,'kW')+' · Güneşten baraya '+read(flow.solarToBus,'kW')+' · Kullanılamayan '+read(flow.curtailed,'kW'));
    add('p','Anlık cihaz tüketimi '+read(flow.totalConsumption,'kW')+' · Kablo kaybı '+read(flow.feederLoss,'kW')+' · Dönüşüm kaybı '+read(flow.totalConversionLoss,'kW'));
    add('p','Batarya '+read(state.battery,'kWh')+' / '+read(GRID.capacity,'kWh')+' · Gereken gece rezervi '+read(live?.reserve,'kWh')+' · İnişte gelen '+read(state.initialEnergy,'kWh'));
    add('p','Bataryaya giren '+read(flow.charging,'kW')+' · Bataryadan çıkan '+read(flow.totalDischarge,'kW')+' · Bataryadan AC baraya '+read(flow.batteryToBus,'kW'));
    add('p','Görev toplamı · Güneş '+read(state.energy.solar,'kWh')+' · Kullanılamayan güneş '+read(state.energy.curtailed,'kWh')+' · Kablo ve dönüşüm kaybı '+read(state.energy.feederLoss+state.energy.conversionLoss,'kWh'));
    add('h3','Cihaz tüketimi');
    const loadRows=[['habitat','Yaşam alanı'],['water','Buz sondajı'],['moxie','MOXIE'],['greenhouse','Sera']].map(([key,name])=>{
      const meter=live?.[key];
      return [name,read(meter?.consumption,'kW'),read(state.loadEnergy[key],'kWh'),read(meter?.loss,'kW'),meter?.sources?.map(id=>'G'+id).join(', ')||'—'];
    });
    loadRows.push(['Batarya ısıtıcısı',read(live?.heater,'kW'),read(state.loadEnergy.heater,'kWh'),'—','—'],
      ['Rover şarjı',read(flow.roverKW,'kW'),read(state.loadEnergy.rover,'kWh'),'—','Batarya'],
      ['Panel temizliği',latest.cleaning?'Temizlik sürüyor':'Beklemede',read(state.loadEnergy.cleaning,'kWh'),'—','Batarya']);
    appendTable(root,['Cihaz','Anlık','Toplam','Hat kaybı','Kaynak'],loadRows);
    add('p','Sera · Mor ışık '+read(live?.greenhouse?.ledKW??0,'kW')+' · Sulama pompası '+read(live?.greenhouse?.pumpKW??0,'kW'));
    if(state.waterTankHold)add('p','Su tankı dolum sınırında durdu. Sondaj 95 L’de yeniden devreye girer.');
    add('p','MOXIE O₂ · '+read(state.oxygen,'kg')+' / '+read(MOXIE_TANK_KG,'kg')+
      (moxieTankFull(state.oxygen)?' · Dolu':state.oxygenTankHold?' · Yeniden başlatma seviyesi bekleniyor':''));
    add('h3','Güneş ve batarya grupları');
    appendTable(root,['Grup','Depo','PV','Şarj','Deşarj','AC çıkış','Reaktif güç','Görünür güç'],
      (live?.groups??[]).map((g,index)=>['G'+(index+1),read(g.stored,'kWh'),read(g.pv,'kW'),
        read(g.charge,'kW'),read(g.draw,'kW'),read(g.output,'kW'),read(g.kvar??0,'kvar'),read(Math.hypot(g.output,g.kvar??0),'kVA')]));
    add('p','Gruplar arası AC aktarım '+read(live?.transferKW??0,'kW'));
    for(const transfer of live?.transfers??[])add('p','G'+transfer.from+' → G'+transfer.to+' · '+read(transfer.kw,'kW'));
    add('p','Silecekler · '+(latest.cleaning?'Çalışıyor':'Hazır'));
    add('p','Panellere ulaşan ışık %'+format(latest.transmission*100)+' · Panel yüzeyi toz oranı %'+format(latest.dust*100));
    if(latest.log.length)add('h3','Şebeke olayları');
    for(const message of latest.log)add('p',message);
    root.querySelectorAll('.power-detail-table').forEach((node,index)=>node.scrollLeft=scrollOffsets[index]??0);
  }

  on(window,'colony:state',event=>{latest=event.detail?.lifeSupport?.electrical;render();});
  on(panel.querySelector('[data-report]'),'click',()=>command('forecast'));
  on(window,'colony:power-report',event=>{
    const results=panel.querySelector('[data-results]');results.replaceChildren();
    for(const [name,rows] of Object.entries(event.detail)){
      const p=document.createElement('p');
      p.textContent=(name==='drillOn'?'Sondaj açık':'Sondaj kapalı')+' · '+rows.map((row,index)=>
        'Sol '+(index+1)+': depo '+read(row.stored,'kWh')+' / habitat açığı '+read(row.gap,'kWh')+
        ' / su '+read(row.water,'L')+' / O₂ '+read(row.oxygen,'kg')+' / ışık '+read(row.led,'sa')).join(' | ');
      results.append(p);
    }
  });
  return {open(){onOpen(panel);render();},dispose(){controller.abort();panel.remove();}};
}
