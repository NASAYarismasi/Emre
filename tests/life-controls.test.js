import { describe, expect, it } from 'vitest';
import { createLifeSupport, stepLifeSupport, setLifeControl, lifeSupportTelemetry, greenhouseLightsOn, GREENHOUSE_LED_KW } from '../src/sim/colonyLifeSupport.js';
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
