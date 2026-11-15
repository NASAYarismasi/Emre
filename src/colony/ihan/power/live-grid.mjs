import { updateWaterTankHold } from "./facility-water.mjs"
import { stepGreenhouseGas } from "./greenhouse-gas.mjs"
import { panelProduction } from "./panel-production.mjs"
import {GRID, SOL_HOURS, solarDay, solarEnergy, feederLoss, LED_KW, DRILL_KW, TANK_L, WATER_KWH_PER_L, CABINET_HEATER_KW, HABITAT_FEEDER_M, nightReserveFor, LOAD_PF, PV_GROUP_KVA, BATTERY_GROUP_KVA, reactiveRatio, remainingActiveKW} from "./mars-power.mjs"

const BANK_CAPACITY=GRID.capacity/5
const EMPTY=.001
const TIE_LIMIT_KW=8
export const MOXIE_BANKS=3
export const MOXIE_MODULES_PER_BANK=3
const MOXIE_MODULES=MOXIE_BANKS*MOXIE_MODULES_PER_BANK
// https://pmc.ncbi.nlm.nih.gov/articles/PMC9432831/
export const MOXIE_KW=MOXIE_MODULES*.3
export const MOXIE_KG_PER_HOUR=MOXIE_MODULES*.006
export const MOXIE_TANK_PER_BANK_KG=5
export const MOXIE_TANK_KG=MOXIE_BANKS*MOXIE_TANK_PER_BANK_KG
export const moxieTankFull=kg=>kg>=MOXIE_TANK_KG
const MOXIE_INTAKE_CO2_KG_H=MOXIE_MODULES*.055*.97

export function stepMoxieGas(state,powered,dt) {
  const oxygen=Math.min(Math.max(0,MOXIE_TANK_KG-state.oxygen),powered?MOXIE_KG_PER_HOUR*dt:0)
  const runHours=oxygen/MOXIE_KG_PER_HOUR
  const intake=MOXIE_INTAKE_CO2_KG_H*runHours
  state.oxygen+=oxygen
  state.oxygenProduced=(state.oxygenProduced??0)+oxygen
  state.co2Intake+=intake
  return {intakeKgHour:intake/dt,oxygenKgHour:oxygen/dt,tankKg:state.oxygen,tanksKg:Array(MOXIE_BANKS).fill(state.oxygen/MOXIE_BANKS),
    intakeTotalKg:state.co2Intake,reactedKgHour:oxygen/dt*88/32}
}

export function createGridState() {
  return {battery:8,banks:[0,0,8/3,8/3,8/3], temperature:10, heaterOn:false, branches:{}, water:0, waterTankHold:false, oxygen:0, oxygenProduced:0, oxygenToHabitat:0, oxygenTransferKgHour:0, co2Intake:0, greenhouseOxygenKg:0, greenhouseNetKg:0, dawn:8, dailyShortfall:0,nightDraw:{greenhouse:0,water:0,moxie:0},loadEnergy:{greenhouse:0,water:0,moxie:0,habitat:0}}
}

export function stepMicrogrid(state, hour, dt, options) {
  const {season, transmission, panelDust, rowDust=Array(6).fill(panelDust), closed, lamp, drill, faults, geometry}=options
  const day=solarDay(season)
  const daylight=geometry?.daylight??hour<day.daylight
  const latitude=18.44*Math.PI/180
  const hourAngle=day.sunset*(2*hour/day.daylight-1)
  const east=geometry?.east??-Math.cos(day.declination)*Math.sin(hourAngle)
  const north=Math.cos(latitude)*Math.sin(day.declination)-
    Math.sin(latitude)*Math.cos(day.declination)*Math.cos(hourAngle)
  const elevation=daylight?Math.sin(latitude)*Math.sin(day.declination)+
    Math.cos(latitude)*Math.cos(day.declination)*Math.cos(hourAngle):0
  const average=Math.sin(18.44*Math.PI/180)*Math.sin(day.declination)+
    Math.cos(18.44*Math.PI/180)*Math.cos(day.declination)*Math.sin(day.sunset)/day.sunset
  const idealProduction=solarEnergy(42,transmission,season)*Math.max(0,elevation)/(average*day.daylight)
  const generation=panelProduction(idealProduction,elevation,east,rowDust)
  const groups=state.banks.map((stored,index)=>({index,stored,...generation[index],charge:0,draw:0,output:0,kvar:0}))
  const production=groups.reduce((sum,group)=>sum+group.pv,0)
  const reserveHours=geometry?(daylight?geometry.nightHours:geometry.nightHours+dt/2):daylight?day.night:Math.max(0,SOL_HOURS-hour+dt/2)
  const reserveDetails=nightReserveFor(reserveHours)
  const reserve=reserveDetails.total
  const reserveAfterStep=nightReserveFor(Math.max(0,(geometry?.nightHours??(SOL_HOURS-hour))-dt/2)).total
  const storage=[groups[4],groups[3],groups[2]]
  const direct=groups.slice(0,2)
  const backupSelected=()=>storage.some(bank=>bank.stored<=EMPTY)
  const nightBanks=()=>backupSelected()?[...storage,...direct]:storage
  const headroom=(bank,ratio)=>remainingActiveKW(bank.output,bank.kvar,daylight?PV_GROUP_KVA:BATTERY_GROUP_KVA,ratio)
  const bankPower=(bank,minimum,ratio=0)=>{
    const stored=groups.reduce((sum,item)=>sum+item.stored,0)
    return Math.min(
      headroom(bank,ratio),
      Math.max(0,GRID.dischargeKW/3-bank.draw*GRID.dischargeEfficiency),
      bank.stored*GRID.dischargeEfficiency/dt,
      Math.max(0,stored-minimum)*GRID.dischargeEfficiency/dt)
  }
  const draw=(demand,minimum=0,ratio=0,critical=false)=>{
    let delivered=0
    for(const group of [...storage,...direct]) {
      if(delivered>=demand || (group.index<2&&!critical&&!backupSelected())) break
      const busRemaining=Math.max(0,GRID.dischargeKW-groups.reduce((sum,bank)=>sum+bank.output,0))
      const power=Math.min(demand-delivered,busRemaining,bankPower(group,minimum,ratio))
      const drawKW=power/GRID.dischargeEfficiency
      group.draw+=drawKW
      group.output+=power
      group.kvar+=power*ratio
      group.stored=Math.max(0,group.stored-drawKW*dt)
      delivered+=power
    }
    return delivered
  }
  const habitatGroup=groups[3]
  const lampDemand=lamp*LED_KW
  const tankHold=updateWaterTankHold(state)
  const drillDemand=daylight&&drill&&!tankHold&&(state.iceKg??1)>0?DRILL_KW:0
  const moxieDemand=daylight&&!moxieTankFull(state.oxygen)?MOXIE_KW:0
  const habitatDemand=daylight?60/(SOL_HOURS/2):6
  const withLoss=(kw,length,pf)=>kw+feederLoss(kw,length,4,pf)
  const localNeeds=[
    closed&&!faults.water?withLoss(drillDemand,190,LOAD_PF.water):0,
    closed&&!faults.greenhouse?withLoss(lampDemand,105,LOAD_PF.greenhouse):0,
    !faults.moxie?withLoss(moxieDemand,90,LOAD_PF.moxie):0,
    withLoss(habitatDemand,HABITAT_FEEDER_M,LOAD_PF.habitat)+CABINET_HEATER_KW,
    0
  ]
  let transferKW=0
  const transfers=[]
  const pvLeft=bank=>Math.max(0,bank.pv-bank.output+bank.draw*GRID.dischargeEfficiency)
  const donorSurplus=(bank,critical,ratio)=>{
    const chargeFirst=bank.index===4||(bank.index===0&&tankHold)
    const reservedCharge=chargeFirst&&!critical&&state.temperature>=0&&bank.stored<BANK_CAPACITY
      ?Math.min(GRID.chargeKW/5,(BANK_CAPACITY-bank.stored)/(dt*GRID.chargeEfficiency)):0
    const localRemaining=Math.max(0,localNeeds[bank.index]-bank.localServed)
    return Math.min(headroom(bank,ratio),Math.max(0,pvLeft(bank)-localRemaining-reservedCharge))
  }
  groups.forEach(bank=>{bank.localServed=0})
  const availablePV=(target,critical,ratio)=>Math.min(pvLeft(target),headroom(target,ratio))+Math.min(TIE_LIMIT_KW-transferKW,
    groups.reduce((sum,bank)=>sum+(bank===target?0:donorSurplus(bank,critical,ratio)),0))
  const servePV=(target,demand,critical=false,ratio=0)=>{
    const own=Math.min(demand,pvLeft(target),headroom(target,ratio))
    target.output+=own
    target.kvar+=own*ratio
    let delivered=own
    for(const bank of groups) {
      if(bank===target) continue
      const shared=Math.min(demand-delivered,donorSurplus(bank,critical,ratio),TIE_LIMIT_KW-transferKW)
      if(shared<=1e-9) continue
      bank.output+=shared
      bank.kvar+=shared*ratio
      delivered+=shared
      transferKW+=shared
      transfers.push({from:bank.index+1,to:target.index+1,kw:shared})
    }
    target.localServed+=delivered
    return delivered
  }
  const fromHabitatGroup=(demand,ratio=0)=>{
    const fromPV=servePV(habitatGroup,demand,true,ratio)
    const fromBattery=Math.min(demand-fromPV,bankPower(habitatGroup,0,ratio))
    habitatGroup.output+=fromBattery
    habitatGroup.kvar+=fromBattery*ratio
    habitatGroup.draw+=fromBattery/GRID.dischargeEfficiency
    habitatGroup.stored=Math.max(0,habitatGroup.stored-fromBattery*dt/GRID.dischargeEfficiency)
    habitatGroup.localServed+=fromBattery
    return fromPV+fromBattery
  }
  const branch=(key,load,length,fault,group,connected=closed)=>{
    const pf=LOAD_PF[key]
    const q=load*reactiveRatio(pf)
    const loss=feederLoss(load,length,4,pf)
    const need=load+loss
    const ratio=need>0?q/need:0
    const minimum=reserveAfterStep
    const bankOutputBefore=groups.map(bank=>bank.output)
    const available=daylight?availablePV(group,false,ratio):Math.min(
      Math.max(0,GRID.dischargeKW-groups.reduce((sum,bank)=>sum+bank.output,0)),
      Math.max(0,groups.reduce((sum,bank)=>sum+bank.stored,0)-minimum)*GRID.dischargeEfficiency/dt,
      nightBanks().reduce((sum,bank)=>sum+bankPower(bank,minimum,ratio),0))
    const branchState=state.branches[key] ??= {on:false,restart:0}
    branchState.restart=Math.max(0,branchState.restart-dt)
    const enabled=connected&&!fault&&need>0
    const on=enabled && (branchState.on
      ? available>=need
      : branchState.restart===0 && available>=need*1.03)
    if(branchState.on&&!on) branchState.restart=30/3600
    branchState.on=on
    if(on) {
      if(daylight) servePV(group,need,false,ratio)
      else draw(need,minimum,ratio)
    }
    const sources=groups.filter(bank=>bank.output-bankOutputBefore[bank.index]>1e-8).map(bank=>bank.index+1)
    const batteryPower=on&&!daylight?need/GRID.dischargeEfficiency:0
    if(!daylight) state.nightDraw[key]+=batteryPower*dt
    return {consumption:on?load:0,loss:on?loss:0,supply:on?need:0,duty:Number(on),
      batteryPower,nightEnergy:state.nightDraw[key],demand:load,fault,sources,kvar:on?q:0,kva:on?load/pf:0,pf:on?pf:null,
      current:on?load*1000/(Math.sqrt(3)*GRID.voltage*pf):0}
  }
  const habitat=habitatDemand
  const habitatLoss=feederLoss(habitat,HABITAT_FEEDER_M,4,LOAD_PF.habitat)
  const habitatInput=habitat+habitatLoss
  const outputsBefore=groups.map(group=>group.output)
  const habitatRatio=habitat*reactiveRatio(LOAD_PF.habitat)/habitatInput
  const delivered=daylight?fromHabitatGroup(habitatInput,habitatRatio):draw(habitatInput,0,habitatRatio,true)
  const life=delivered*habitat/habitatInput
  const habitatMeter={consumption:life,loss:delivered-life,supply:delivered,duty:life/habitat,
    batteryPower:daylight?habitatGroup.draw:delivered/GRID.dischargeEfficiency,nightEnergy:0,demand:habitat,kvar:life*reactiveRatio(LOAD_PF.habitat),kva:life/LOAD_PF.habitat,pf:life>0?LOAD_PF.habitat:null,
    current:life*1000/(Math.sqrt(3)*GRID.voltage*LOAD_PF.habitat),
    sources:groups.filter(group=>group.output-outputsBefore[group.index]>1e-8).map(group=>group.index+1)}
  const ambient=-60+38*Math.max(0,elevation)
  if(state.temperature<=7) state.heaterOn=true
  else if(state.temperature>=9) state.heaterOn=false
  let heater=!daylight&&state.heaterOn?draw(CABINET_HEATER_KW,0,0,true):0
  if(daylight&&state.heaterOn) heater=fromHabitatGroup(CABINET_HEATER_KW)
  const greenhouse=branch("greenhouse",lampDemand,105,faults.greenhouse,direct[1])
  const moxie=branch("moxie",moxieDemand,90,faults.moxie,groups[2],true)
  const plantGas=stepGreenhouseGas(state,{elevation,transmission,ledFraction:greenhouse.duty*lamp},dt)
  const gas=stepMoxieGas(state,moxie.duty>0,dt)
  const water=branch("water",drillDemand,190,faults.water,direct[0])
  for(const [key,power] of Object.entries({habitat:life,greenhouse:greenhouse.consumption,moxie:moxie.consumption,water:water.consumption}))
    state.loadEnergy[key]+=power*dt
  state.dailyShortfall+=(habitat-life)*dt
  state.temperature+=(heater-.016*(state.temperature-ambient))*dt/.25
  if(daylight&&state.temperature>=0) for(const group of groups) {
    if(group.draw>0) continue
    const input=Math.min(Math.max(0,group.pv-group.output),GRID.chargeKW/5,Math.max(0,BANK_CAPACITY-group.stored)/(dt*GRID.chargeEfficiency))
    group.charge=input*GRID.chargeEfficiency
    group.stored+=group.charge*dt
  }
  water.tankHold=tankHold
  water.lineEnergized=closed&&!faults.water&&(production>0||groups.some(group=>group.output>0))
  Object.assign(groups[0],{waterTankHold:tankHold,waterLineEnergized:water.lineEnergized})
  state.water=Math.min(TANK_L,state.water+water.consumption*dt/WATER_KWH_PER_L)
  state.banks=groups.map(group=>group.stored)
  state.battery=state.banks.reduce((sum,stored)=>sum+stored,0)
  return {groups,transfers,transferKW,backupActive:!daylight&&(backupSelected()||direct.some(group=>group.draw>0)),daylight,elevation,east,north,production,heater,reserve,reserveDetails,life,habitat:habitatMeter,moxie,gas,plantGas,greenhouse,water}
}

export function payForSweep(state,reserve) {
  const cost=.20/GRID.dischargeEfficiency
  if(state.battery<reserve+cost || state.temperature<0) return false
  for(let i=0;i<5;i++) state.banks[i]-=cost*state.banks[i]/state.battery
  state.battery-=cost
  return true
}
