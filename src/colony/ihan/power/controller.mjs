import {marsSun,JEZERO} from '../../../sim/marsSun.js';
import {createGridState,stepMicrogrid} from './live-grid.mjs';
import {SOL_HOURS,solarDay} from './mars-power.mjs';
import {createAutomaticRecovery} from './black-start.mjs';
import {projectPower} from './live-projection.mjs';
import {createSolarWeather,advanceSolarWeather,cleanSolarRows,solarWeatherReadings} from './solar-weather.mjs';

function solarGeometry(solar,daylight){
  const sunrise=12-Math.acos(-Math.tan(JEZERO.latitude)*Math.tan(solar.declination))*12/Math.PI;
  const localHour=solar.ltst/3600;
  const remainingNight=(24+sunrise-localHour)%24;
  return {
    daylight,
    elevation:Math.max(0,Math.sin(solar.elevation)),
    east:Math.sin(solar.azimuth)*Math.cos(solar.elevation),
    north:Math.cos(solar.azimuth)*Math.cos(solar.elevation),
    nightHours:(daylight?2*sunrise:remainingNight)*SOL_HOURS/24,
  };
}

export function createPowerController(){
  let weather=createSolarWeather();
  let state=createGridState(),recovery=createAutomaticRecovery(),live=null,lastClock=null,sol=0,hour=0;
  const controls={closed:true,drill:true,season:0,lamp:true,blackStart:true};
  const log=[];
  let lastReservation=null, lastDaylight=null;
  function append(message){if(message){log.push(message);if(log.length>30)log.shift();}}
  function options(lamp){const {transmission,dust,rowDust}=solarWeatherReadings(weather);return {...controls,transmission,panelDust:dust,rowDust,lamp:lamp?1:0,faults:{}};}
  return {
    controls,
    syncWater(water){state.water=water.cleanL;state.iceKg=water.iceKg;},
    consumeEnergy(requested){
      if(!Number.isFinite(requested))return 0;
      if(requested<0){
        if(!lastReservation)return 0;
        const refundable=Math.min(-requested,lastReservation.total);
        for(let i=0;i<state.banks.length;i++){
          state.banks[i]=Math.min(36,state.banks[i]+refundable*lastReservation.shares[i]);
        }
        lastReservation=null;
        state.battery=state.banks.reduce((sum,value)=>sum+value,0);
        return 0;
      }
      if(requested===0||!live||live.recovering)return 0;
      const available=Math.max(0,state.battery-live.reserve);
      const accepted=Math.min(requested,available);
      if(accepted<=0)return 0;
      const shares=state.banks.map(value=>value/state.battery);
      lastReservation={total:accepted,shares};
      state.banks=state.banks.map((value,index)=>value-accepted*shares[index]);
      state.battery=state.banks.reduce((sum,value)=>sum+value,0);
      return accepted;
    },
    update(environment,lamp,onStep){
      const clock=environment.unixSeconds;
      if(lastClock===null){lastClock=clock;const daylight=solarDay(controls.season).daylight;hour=((environment.lmst??8)*SOL_HOURS/24-(SOL_HOURS-daylight)/2+SOL_HOURS)%SOL_HOURS;}
      const useSceneSun=Number.isFinite(environment.sunElevationDeg);
      let remaining=Math.max(0,clock-lastClock);lastClock=clock;
      while(remaining>1e-8){
        const day=solarDay(controls.season);
        const boundary=hour<day.daylight?day.daylight:SOL_HOURS;
        const seconds=Math.min(remaining,30,(boundary-hour)*3600);
        if(seconds<1e-7){
          hour=boundary===SOL_HOURS?0:day.daylight;
          if(boundary===SOL_HOURS)sol++;
          continue;
        }
        const midpoint=hour+seconds/7200;
        const previousOpacity=weather.opacity;
        advanceSolarWeather(weather,seconds);
        if(previousOpacity<.35&&weather.opacity>=.35)append("Toz cephesi yaklaşıyor. Panel üretimi düşüyor.");
        if(previousOpacity>=.35&&weather.opacity<.35)append("Toz cephesi uzaklaşıyor.");
        const solar=useSceneSun?marsSun(clock-remaining+seconds/2):null;
        const daylight=solar?solar.elevation>0:midpoint<day.daylight;
        const geometry=solar?solarGeometry(solar,daylight):null;
        if(lastDaylight!==null&&daylight!==lastDaylight)
          append(daylight?'Gün doğdu · PV üretimi başladı.':'Gün battı · PV sıfır, gece beslemesi bataryadan.');
        lastDaylight=daylight;
        const opts={...options(controls.lamp&&lamp),geometry};
        live=(controls.blackStart?recovery.step(state,daylight,seconds,append):null)
          ??stepMicrogrid(state,midpoint,seconds/3600,opts);
        onStep?.(live,seconds/3600,state);
        cleanSolarRows(weather,seconds,daylight,state,live,append);
        hour+=seconds/3600;remaining-=seconds;
        if(hour>=SOL_HOURS-1e-9){hour=0;sol++;}
      }
    },
    get telemetry(){return {state:structuredClone(state),live:live?structuredClone(live):null,sol,hour,...solarWeatherReadings(weather),cleaning:weather.sweepElapsed!==null,controls:{...controls},log:[...log]};},
    forecast(facility){
      const snapshot={...options(facility?.lamp??controls.lamp),facility,blackStart:controls.blackStart,state:structuredClone(state),recovery:recovery.snapshot(),hour,sol,
        solarWeather:structuredClone(weather)};
      return {drillOn:projectPower(snapshot,true),drillOff:projectPower(snapshot,false)};
    },
    reset(){lastDaylight=null;lastReservation=null;weather=createSolarWeather();log.length=0;state=createGridState();recovery=createAutomaticRecovery();lastClock=null;hour=0;sol=0;live=null;}
  };
}
