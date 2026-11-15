import {GRID,SOL_HOURS} from './mars-power.mjs';
import {payForSweep} from './live-grid.mjs';

const solSeconds=SOL_HOURS*3600;
const clamp=value=>Math.max(0,Math.min(1,value));
const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
const cleanSeconds=90, rowDelay=18, rowCount=6;
const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;

export function createSolarWeather(){
  return {elapsed:0,opacity:0,rows:[.024,.028,.032,.036,.04,.044],sweepElapsed:null,solarCleaningCredit:0};
}

export function advanceSolarWeather(weather,seconds){
  weather.elapsed+=seconds;
  // GAME ASSUMPTION: local dust fronts with varying timing and strength per sol.
  const sol=Math.floor(weather.elapsed/solSeconds);
  const age=weather.elapsed%solSeconds-(75+(sol*7937)%42000);
  weather.opacity=(.80+(sol%4)*.05)*smooth(age/150)*smooth((510-age)/180);
  weather.rows=weather.rows.map((dust,row)=>Math.min(.75,
    dust+seconds*(.0001/3600+weather.opacity*(.00026+row*.00004))));
}

export function cleanSolarRows(weather,seconds,daylight,state,live,append){
  const cost=.20/GRID.dischargeEfficiency;
  const charging=live.groups.reduce((sum,group)=>sum+group.charge,0);
  weather.solarCleaningCredit=daylight
    ? Math.min(cost,weather.solarCleaningCredit+charging*seconds/3600)
    : 0;
  if(weather.sweepElapsed===null){
    // During the day, the last 0.20 kWh budgeted from new solar charging can fund maintenance.
    const cleaningFloor=Math.min(live.reserve,Math.max(0,state.battery-weather.solarCleaningCredit));
    if(daylight&&weather.opacity<.26&&mean(weather.rows)>=.085&&payForSweep(state,cleaningFloor)){
      weather.solarCleaningCredit=0;
      weather.sweepElapsed=0;
      live.groups.forEach((group,index)=>{group.stored=state.banks[index];});
      append?.('Panel temizliği başladı. Sıralar sırayla temizleniyor.');
    }
    return;
  }
  const before=weather.sweepElapsed;
  weather.sweepElapsed+=seconds;
  weather.rows=weather.rows.map((dust,row)=>{
    const start=row*rowDelay;
    const cleaned=clamp((weather.sweepElapsed-start)/cleanSeconds)-clamp((before-start)/cleanSeconds);
    return Math.max(.015,dust*Math.exp(-cleaned*(1.45-row*.075)));
  });
  if(weather.sweepElapsed>=cleanSeconds+(rowCount-1)*rowDelay){
    weather.sweepElapsed=null;
    append?.('Panel temizliği tamamlandı.');
  }
}

export function solarWeatherReadings(weather){
  return {opacity:weather.opacity,transmission:1-.76*weather.opacity,rowDust:[...weather.rows],dust:mean(weather.rows),
    strokes:weather.rows.map((_,row)=>weather.sweepElapsed===null?0:
      Math.sin(Math.PI*clamp((weather.sweepElapsed-row*rowDelay)/cleanSeconds)))};
}
