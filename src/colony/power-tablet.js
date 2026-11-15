import {MOXIE_TANK_KG,moxieTankFull} from "./ihan/power/live-grid.mjs";
const format=value=>Number.isFinite(value)?value.toLocaleString('tr-TR',{maximumFractionDigits:2}):'—';
export function mountPowerTablet(onOpen){
  const panel=document.createElement('section');panel.className='colony-drawer';panel.hidden=true;
  panel.innerHTML='<h2>Enerji dağıtımı</h2><div data-controls></div><div data-readings></div><button data-report>İki sondaj kararını karşılaştır</button><div data-results></div>';
  document.body.append(panel);
  const controller=new AbortController(),on=(node,type,fn)=>node.addEventListener(type,fn,{signal:controller.signal});
  let latest=null;
  const controls=panel.querySelector('[data-controls]');
  for(const [key,label]of [['closed','Ana şalter'],['drill','Sondaj'],['lamp','Sera LED izni'],['blackStart','İlk gece otomatik kurtarma']]){
    const button=document.createElement('button');button.dataset.control=key;button.textContent=label;
    on(button,'click',()=>window.dispatchEvent(new CustomEvent('colony:power-command',{detail:{key,value:!latest?.controls[key]}})));controls.append(button);
  }
  const select=document.createElement('select');select.setAttribute('aria-label','Mars mevsimi');
  for(const [value,label]of [[0,'Ekinoks'],[90,'Kuzey yazı'],[180,'Sonbahar'],[270,'Kuzey kışı']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
  on(select,'change',()=>window.dispatchEvent(new CustomEvent('colony:power-command',{detail:{key:'season',value:Number(select.value)}})));controls.append(select);
  on(window,'colony:state',event=>{
    latest=event.detail?.lifeSupport?.electrical;
    if(!latest||panel.hidden)return;
    for(const button of controls.querySelectorAll('button')){const enabled=latest.controls[button.dataset.control];button.setAttribute('aria-pressed',String(enabled));}
    const t=latest.live,s=latest.state;
    const root=panel.querySelector('[data-readings]');root.replaceChildren();
    const paragraph=text=>{const p=document.createElement('p');p.textContent=text;root.append(p);};
    paragraph('Depo '+format(s.battery)+' / 180 kWh · PV '+format(t?.production)+' kW · Gece rezervi '+format(t?.reserve)+' kWh');
    paragraph((latest.opacity>=.35?'Toz fırtınası':latest.opacity>.02?'Tozlu hava':'Açık hava')+' · Panellere ulaşan ışık %'+format(latest.transmission*100)+(latest.cleaning?' · Silecekler çalışıyor':''));
    paragraph('kW anlık gücü, kWh biriken veya harcanan enerjiyi gösterir.');
    paragraph('Panel tozu %'+format(latest.dust*100)+' · Kabin '+format(s.temperature)+' °C · Habitat açığı '+format(s.dailyShortfall)+' kWh');
    const table=document.createElement('table');
    for(const [index,g]of (t?.groups??[]).entries()){
      const row=document.createElement('tr');
      for(const value of ['G'+(index+1),format(g.stored)+' kWh','Güneş '+format(g.pv)+' kW','Bataryaya '+format(g.charge)+' kW','Bataryadan '+format(g.draw)+' kW','AC '+format(g.output)+' kW',format(g.kvar)+' kvar',format(Math.hypot(g.output??0,g.kvar??0))+' kVA']){
        const cell=document.createElement('td');cell.textContent=value;row.append(cell);
      }table.append(row);
    }root.append(table);
    for(const key of ['habitat','water','moxie','greenhouse']){
      const m=t?.[key];
      if(!m)continue;
      const label={habitat:'Yaşam alanı',water:'Buz sondajı',moxie:'MOXIE',greenhouse:'Sera'}[key];
      const sources=m.sources?.length?' · Besleyen '+m.sources.map(id=>'G'+id).join(', '):'';
      if(key==='water'&&m.tankHold)paragraph('Su tankı doldu. Sondaj 95 L’ye kadar beklemede · '+(m.lineEnergized?'Besleme hattı açık':'Besleme hattı enerjisiz')+' · G1 bataryasına '+format(t.groups[0].charge)+' kW giriyor.');
      paragraph(label+(m.duty>0?' çalışıyor':' beklemede')+' · Cihaz '+format(m.consumption)+' kW kullanıyor · Kabloda '+format(m.loss*1000)+' W kayıp'+sources);
      paragraph('Hat çıkışı '+format(m.supply)+' kW · Akım '+format(m.current)+' A · Reaktif güç '+format(m.kvar)+' kvar · Toplam cihaz yükü '+format(m.kva)+' kVA · Güç faktörü '+format(m.pf));
    }
    paragraph('AC bara desteği '+format(t?.transferKW)+' kW');
    for(const transfer of t?.transfers??[])paragraph('G'+transfer.from+' → G'+transfer.to+' · '+format(transfer.kw)+' kW');
    for(const [i,g]of (t?.groups??[]).entries())paragraph('G'+(i+1)+' panel aralığı '+format(g.weakest*1000)+'–'+format(g.strongest*1000)+' W · %80 altında '+(g.lowPanels??0)+' panel');
    paragraph('MOXIE · O₂ üretimi '+format((t?.gas?.oxygenKgHour??0)*1000)+' g/sa · Toplam tank '+format(s.oxygen)+' / '+MOXIE_TANK_KG+' kg'+(moxieTankFull(s.oxygen)?' · Tanklar dolu, beklemede':''))
    paragraph('MOXIE → Habitat · Aktarım '+format(s.oxygenTransferKgHour*1000)+' g/sa · Toplam aktarılan '+format(s.oxygenToHabitat*1000)+' g');
    paragraph('Sera toplamı · Net O₂ '+format((t?.plantGas?.netKgHour??0)*1000)+' g/sa · Birikimli net '+format(s.greenhouseNetKg*1000)+' g')

    for(const message of latest.log)paragraph(message);
  });
  on(panel.querySelector('[data-report]'),'click',()=>window.dispatchEvent(new CustomEvent('colony:power-command',{detail:{key:'forecast'}})));
  on(window,'colony:power-report',event=>{
    const results=panel.querySelector('[data-results]');results.replaceChildren();
    for(const [name,rows]of Object.entries(event.detail)){const p=document.createElement('p');p.textContent=(name==='drillOn'?'Sondaj açık':'Sondaj kapalı')+' · '+rows.map((r,i)=>'Sol '+(i+1)+': depo '+format(r.stored)+' kWh / habitat açığı '+format(r.gap)+' kWh / su '+format(r.water)+' L / O₂ '+format(r.oxygen)+' kg / ışık '+format(r.led)+' sa').join(' | ');results.append(p);}
  });
  return {open(){onOpen(panel);},dispose(){controller.abort();panel.remove();}};
}
