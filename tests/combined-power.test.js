import {it,expect} from 'vitest'
import {createPowerController} from '../src/colony/ihan/power/controller.mjs'
import {advanceFacilityWater} from '../src/colony/ihan/power/facility-water.mjs'
import {createWaterState} from '../src/sim/ihanLifeSupportModels.js'
import {DRILL_KW,WATER_KWH_PER_L} from '../src/colony/ihan/power/mars-power.mjs'

it('uses the same extraction energy per litre as the live grid',()=>{
  const initial=createWaterState()
  const water=advanceFacilityWater(initial,1,{water:{consumption:2},habitat:{duty:1}},3)
  expect(water.extractedL).toBeCloseTo(DRILL_KW/WATER_KWH_PER_L,8)
  expect(initial.extractedL).toBe(0)
})

it('does not forecast a programmed blackout when recovery is disabled',()=>{
  const p=createPowerController()
  const start={unixSeconds:0,lmst:12,storm:false}
  p.update(start,true)
  p.update({...start,unixSeconds:1},true)
  const enabled=p.forecast().drillOff[0]
  p.controls.blackStart=false
  const disabled=p.forecast().drillOff[0]
  expect(disabled.gap).toBeLessThan(enabled.gap)
})

it('protects emergency batteries from optional rover charging',()=>{
  const p=createPowerController();
  const start={unixSeconds:0,lmst:22,storm:false};
  p.update(start,true);
  p.update({...start,unixSeconds:1},true);
  expect(p.telemetry.live.recovering).toBe(true);
  expect(p.consumeEnergy(1)).toBe(0);
  expect(p.telemetry.state.battery).toBe(8);
});

it('uses backup banks if primary kVA headroom is insufficient before they empty',async()=>{
  const {createGridState,stepMicrogrid}=await import('../src/colony/ihan/power/live-grid.mjs');
  const state=createGridState();
  state.banks=[20,20,.00101,.00101,.00101];
  const live=stepMicrogrid(state,20,.1,{season:0,transmission:1,panelDust:0,closed:true,lamp:1,drill:true,faults:{}});
  expect(live.life).toBeCloseTo(6,8);
  expect(live.habitat.sources).toContain(1);
  expect(live.groups.every(group=>Math.hypot(group.output,group.kvar)<=4+1e-8)).toBe(true);
});

it('stops a full tank with the feeder energized and charges the drill bank until the restart level',async()=>{
  const {createGridState,stepMicrogrid}=await import('../src/colony/ihan/power/live-grid.mjs')
  const state=createGridState()
  const options={season:0,transmission:1,panelDust:0,closed:true,lamp:0,drill:true,faults:{}}
  const step=()=>stepMicrogrid(state,6,1/120,options)
  state.water=100
  const full=step()
  expect(full.water).toMatchObject({tankHold:true,lineEnergized:true,consumption:0,current:0,duty:0})
  expect(full.groups[0].charge).toBeGreaterThan(0)
  expect(state.banks[0]).toBeGreaterThan(0)
  state.water=99
  expect(step().water.tankHold).toBe(true)
  options.closed=false
  expect(step().water.lineEnergized).toBe(false)
  options.closed=true
  state.water=95
  expect(step().water).toMatchObject({tankHold:false,consumption:DRILL_KW,duty:1})
})
