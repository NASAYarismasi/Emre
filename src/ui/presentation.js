import { CREW_RATES } from '../data/sls.js';

export function missionCalendar(t) {
  if(t.phase==='CRUISE')return `Seyir · ${Math.min(Math.ceil(t.transfer.duration/86400),Math.floor(t.cruiseProgress*t.transfer.duration/86400)+1)}. gün / ${Math.ceil(t.transfer.duration/86400)}`;
  return ({PRELAUNCH:'Kalkış hazırlığı',ASCENT:'Dünya’dan kalkış',PARKING_ORBIT:'Dünya park yörüngesi',TMI_BURN:'Mars transfer ateşlemesi',MOI_BURN:'Mars yakalama ateşlemesi',MARS_ORBIT:'Mars park yörüngesi',DEORBIT:'Mars’a yaklaşma',EDL:'Atmosfere giriş ve iniş',LANDED:'Mars yüzeyi',FAILED:'Görev değerlendirmesi'})[t.phase]??'Görev takibi';
}

export function missionElapsed(seconds) {
  const value=Math.max(0,Math.floor(seconds)),days=Math.floor(value/86400),hours=Math.floor(value/3600)%24,minutes=Math.floor(value/60)%60;
  return days?`T+ ${days} g ${hours} sa ${minutes} dk`:`T+ ${hours} sa ${minutes} dk ${value%60} sn`;
}

export const EVENT_CAPTIONS=Object.freeze({LIFTOFF:'Kalkış · Mars yolculuğu başladı',MAX_Q:'Max-Q · En yüksek aerodinamik yük',SRB_SEPARATION:'Katı iticiler ayrıldı',LAS_JETTISON:'Kurtarma kulesi ayrıldı',MECO:'Ana motor kesildi · Kademe ayrılması',ICPS_IGNITION:'Üst kademe ateşlendi',ORBIT_INSERTION:'Dünya park yörüngesine ulaşıldı',TMI_BURN:'Mars transfer ateşlemesi başladı',CRUISE:'Dünya’dan ayrılış · Gezegenler arası seyir',MOI_BURN:'Mars yakalama ateşlemesi başladı',MARS_ORBIT:'Mars park yörüngesine ulaşıldı',DEORBIT:'Yörüngeden çıkış · İniş koridoruna yaklaşma',EDL:'Mars atmosferine giriş',HEATSHIELD_JETTISON:'Isı kalkanı ayrıldı · İniş motorları ateşlendi',LEGS_DEPLOYED:'İniş bacakları açılıyor',TOUCHDOWN:'Temas · Mars’a hoş geldiniz'});

/** UI projections only: all quantities originate in the mission snapshot. */
export function vehicleConfiguration(t) {
  if (['DEORBIT','EDL','LANDED'].includes(t.phase) || t.mars && t.phase==='FAILED') return 'lander';
  if (['TMI_BURN','CRUISE','MOI_BURN','MARS_ORBIT'].includes(t.phase)) return 'transit';
  if (t.stages.find(s=>s.id==='srb')?.attached) return 'boosters';
  return t.stages.find(s=>s.id==='core')?.attached ? 'core' : 'upper';
}

export function apsisReadout(value, eccentricity, kind) {
  if (kind==='apo' && (eccentricity>=1 || value===Infinity)) return {value:'—',unit:'açık yörünge'};
  if (Number.isFinite(value) && value<0) return {value:'—',unit:'yörünge altı'};
  return {value:Number.isFinite(value)?(value/1000).toLocaleString('tr-TR',{minimumFractionDigits:1,maximumFractionDigits:1}):'—',unit:Number.isFinite(value)?'km':''};
}

export function resourceDays(t, resource) {
  const consumption=CREW_RATES[resource]*t.crew.length;
  return consumption>0 ? t.supplies[resource]/consumption : Infinity;
}

export function nextEvent(t) {
  if (t.phase==='PRELAUNCH') return t.countdown.running ? t.countdown.time < -6.5 ? 'Ana motor ateşlemesi' : 'Kalkış / T−0' : 'Geri sayımı başlat';
  if (t.phase==='ASCENT') {
    if(t.stages.find(s=>s.id==='srb').attached) return 'Katı itici ayrılması';
    if(t.lasAttached) return 'Kurtarma kulesinin atılması';
    return t.stages.find(s=>s.id==='core').attached ? 'Ana kademe ayrılması' : 'Park yörüngesine giriş';
  }
  return {PARKING_ORBIT:'Mars transferi / B',TMI_BURN:'Seyir başlangıcı',CRUISE:'Mars yakalama ateşlemesi',MOI_BURN:'Mars park yörüngesi',MARS_ORBIT:'İnişi başlat / B',DEORBIT:'Atmosfere giriş',EDL:t.engineFiring?'Yüzeye temas':'İniş motoru ateşlemesi',LANDED:'Koloniye devir',FAILED:'Görev değerlendirmesi'}[t.phase]??'Görev takibi';
}
