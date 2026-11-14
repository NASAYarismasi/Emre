import { describe, expect, it } from 'vitest';
import { createLifeSupport, stepLifeSupport, syncLifeSupport, setLifeControl, lifeSupportTelemetry, greenhouseLightsOn, GREENHOUSE_LED_KW } from '../src/sim/colonyLifeSupport.js';
import { LED_KW, DRILL_KW, WATER_KWH_PER_L, solarEnergy, powerForecast } from '../src/colony/ihan/mars-power.mjs';
import { createPower, powerSupply, settlePower, POWER_SWITCHES } from '../src/sim/colonyPower.js';
import { createColony, exampleLanding } from '../src/colony/mars-koloni.mjs';

const powered = () => ({ ...createLifeSupport(createColony(exampleLanding)), budget: { energyKWh: 1e6, powerKW: 20, storm: false, generation: 99 } });
const HOUR = 3600;

describe('facility computers drive İhan\'s air/water models', () => {
  it('everything on: O₂ produced at 0.108 kg/h, CO₂ scrubbed, ice extracted', () => {
    const s = stepLifeSupport(powered(), HOUR), t = lifeSupportTelemetry(s);
    expect(s.air.generatedKg).toBeCloseTo(.108, 6);
    expect(s.air.removedCO2Kg).toBeGreaterThan(0);
    expect(s.water.extractedL).toBeGreaterThan(0);
    expect(t.oxygenHours).toBeCloseTo(s.air.oxygenKg / (3 * .84 / 24), 9);
  });
  it('O₂ producer off: no production, scrubber still runs and its power is not spent on the producer', () => {
    const s = stepLifeSupport(setLifeControl(powered(), 'air', 'producer', false), HOUR);
    expect(s.air.generatedKg).toBe(0); expect(s.air.removedCO2Kg).toBeGreaterThan(0);
    expect(s.air.powerUsedKW).toBeCloseTo(.8, 9);
  });
  it('scrubber off: CO₂ accumulates while O₂ is still produced', () => {
    const s = stepLifeSupport(setLifeControl(powered(), 'air', 'scrubber', false), HOUR);
    expect(s.air.removedCO2Kg).toBe(0); expect(s.air.co2Kg).toBeGreaterThan(.08); expect(s.air.generatedKg).toBeGreaterThan(0);
  });
  it('fans off stops the whole air plant (no circulation)', () => {
    const s = stepLifeSupport(setLifeControl(powered(), 'air', 'fans', false), HOUR);
    expect(s.air.generatedKg).toBe(0); expect(s.air.removedCO2Kg).toBe(0); expect(s.air.powerUsedKW).toBe(0);
  });
  it('ice extraction off: no extracted water; grow lights draw their power', () => {
    let s = setLifeControl(setLifeControl(powered(), 'water', 'extract', false), 'greenhouse', 'led', 'on');
    s = stepLifeSupport(s, HOUR);
    expect(s.water.extractedL).toBe(0);
    expect(s.greenhouse.ledOn).toBe(true);
    expect(s.spentKWh).toBeGreaterThan(GREENHOUSE_LED_KW * .99);
  });
  it('auto grow lights follow the Sun and unknown controls are rejected', () => {
    const c = { greenhouse: { led: 'auto' } };
    expect(greenhouseLightsOn(c, 30)).toBe(false); expect(greenhouseLightsOn(c, -5)).toBe(true);
    expect(() => setLifeControl(powered(), 'air', 'warp', true)).toThrow(RangeError);
  });
});

describe('ed79956 physical power wiring', () => {
  const physical = () => createLifeSupport(createColony(exampleLanding));
  it('adopts tray-derived LEDs and distinguishes the sublimation forecast from actual water', () => {
    expect(GREENHOUSE_LED_KW).toBe(LED_KW);
    expect(LED_KW).toBeCloseTo(3.36528, 8);
    expect(DRILL_KW).toBe(2);
    expect(WATER_KWH_PER_L).toBeGreaterThan(1.8);
    expect(solarEnergy(42, 1)).toBe(420);
    const forecast = powerForecast(1);
    expect(forecast.waterLiters).toBeCloseTo(forecast.drilling * DRILL_KW / WATER_KWH_PER_L, 9);
    const s = stepLifeSupport(physical(), HOUR, 90);
    expect(s.water.extractedL).toBeCloseTo(20 / 6, 9);
    expect(s.power.batteryKWh).toBeLessThanOrEqual(180);
  });
  it('main breaker stops LEDs, irrigation and drilling while habitat air and recovery stay supplied', () => {
    let s = setLifeControl(physical(), 'greenhouse', 'led', 'on');
    s = stepLifeSupport(setLifeControl(s, 'power', 'main', false), HOUR, 90);
    expect(s.water.extractedL).toBe(0);
    expect(s.water.recoveredL).toBeGreaterThan(0);
    expect(s.air.generatedKg).toBeGreaterThan(0);
    expect(s.greenhouse).toMatchObject({ ledOn: false, pumpOn: false, powerKW: 0 });
    expect(lifeSupportTelemetry(s).power.forecast.drilling).toBe(0);
  });
  it('each inverter removes one tenth of solar from its correct branch; storm transmission is 20%', () => {
    const p = createPower(100), all = powerSupply(p, POWER_SWITCHES, 90, false, 1 / 60);
    const direct = powerSupply(p, { ...POWER_SWITCHES, inv1: false }, 90, false, 1 / 60);
    const charge = powerSupply(p, { ...POWER_SWITCHES, inv3: false }, 90, false, 1 / 60);
    expect(all.directKW - direct.directKW).toBeCloseTo(all.solarKW / 10, 9);
    expect(all.storageKW - charge.storageKW).toBeCloseTo(all.solarKW / 10, 9);
    expect(direct.storageKW).toBe(all.storageKW);
    expect(powerSupply(p, POWER_SWITCHES, 90, true, 1 / 60).solarKW).toBeCloseTo(all.solarKW * .2, 9);
    const state = createColony(exampleLanding); state.timeline.push({ storm: true });
    expect(stepLifeSupport(createLifeSupport(state), 60, 90).power.transmission).toBe(.2);
  });
  it('battery support controls actual night loads without disconnecting habitat', () => {
    const lit = setLifeControl(physical(), 'greenhouse', 'led', 'on');
    const on = stepLifeSupport(lit, HOUR, -10);
    const off = stepLifeSupport(setLifeControl(lit, 'power', 'batterySupport', false), HOUR, -10);
    expect(on.greenhouse.ledOn).toBe(true); expect(on.water.extractedL).toBeGreaterThan(0);
    expect(off.greenhouse.ledOn).toBe(false); expect(off.water.extractedL).toBe(0);
    expect(off.air.generatedKg).toBeGreaterThan(0);
    expect(off.power.batteryKWh).toBeGreaterThan(on.power.batteryKWh);
    expect(lifeSupportTelemetry(off).power.forecast.lit).toBe(0);
  });
  it('opening all inverter lines prevents charging; depletion cannot create energy or run units', () => {
    let s = physical(); s.power.batteryKWh = 0;
    for (let i = 1; i <= 10; i++) s = setLifeControl(s, 'power', 'inv' + i, false);
    s = stepLifeSupport(s, HOUR, 90);
    expect(s.power.batteryKWh).toBe(0); expect(s.spentKWh).toBe(0);
    expect(s.air.generatedKg).toBe(0); expect(s.water.extractedL).toBe(0);
    expect(s.greenhouse.ledOn).toBe(false);
  });
  it('settles actual loads with 90% charging and accounts for stored discharge', () => {
    const p = createPower(50), supply = powerSupply(p, POWER_SWITCHES, 90, false, 1);
    const next = settlePower(p, POWER_SWITCHES, supply, 1, 5, 2);
    expect(next.batteryKWh - p.batteryKWh).toBeCloseTo((supply.storageKW - 5) * .9, 9);
    const night = powerSupply(p, POWER_SWITCHES, -10, false, 1);
    expect(settlePower(p, POWER_SWITCHES, night, 1, 5, 2).batteryKWh).toBe(43);
  });
  it('charges only actual extraction/recovery work when the water tank is almost full', () => {
    let s = physical(); s.water.cleanL = 100;
    s = stepLifeSupport(s, 60, -10);
    expect(s.power.drillKW).toBeLessThan(DRILL_KW);
    expect(s.power.habitatKW).toBeGreaterThanOrEqual(1 + s.air.powerUsedKW);
    expect(s.power.habitatKW + s.power.loadKW).toBeCloseTo(s.power.auxiliaryKW + s.air.powerUsedKW + s.water.powerUsedKW + s.greenhouse.powerKW, 9);
  });
  it('sol synchronization retains switches and storage rather than refilling from educational battery', () => {
    const previous = createColony(exampleLanding), next = structuredClone(previous);
    next.sol++; next.battery = 100000;
    let s = setLifeControl(createLifeSupport(previous), 'power', 'main', false);
    s.elapsedInSol = 24.66 * HOUR; s.power.batteryKWh = 17;
    s = syncLifeSupport(s, previous, next);
    expect(s.controls.power.main).toBe(false); expect(s.power.batteryKWh).toBe(17);
  });
});
