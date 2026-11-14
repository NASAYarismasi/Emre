/** IHAN-SRC — host wiring for İhan's a7d5ce6 air/water models. No DOM/Three.js. */
import { AIR_DEFAULTS, WATER_DEFAULTS, createAirState, createWaterState, stepAir, stepWater } from './ihanLifeSupportModels.js';

export const LIFE_SOL_SECONDS = 24.66 * 3600;
// GAME ASSUMPTION: one colony energy unit represents 12 kWh for this physical
// projection. The original colony rules remain in educational energy units.
export const COLONY_ENERGY_KWH = 12;
const active = (state, type) => state.placed.filter(m => m.active && m.type === type).length;
const crewCount = state => state.crew.filter(p => p.health > 0).length;

export function lifePowerBudget(state, previous = state) {
  const day = state.timeline.at(-1);
  const storm = Boolean(day?.storm);
  const generation = day?.generation ?? active(state, 'solarPanel') * (storm ? 4 : 12);
  const stored = state === previous ? state.startupEnergy + state.battery : previous.startupEnergy + previous.battery;
  // Other colony loads have priority; the physical plants share only the remainder.
  const energyKWh = Math.max(0, stored + generation - (day?.used ?? 0)) * COLONY_ENERGY_KWH;
  return { energyKWh, powerKW: energyKWh / 24.66, storm, generation };
}

export function createLifeSupport(state) {
  const crew = crewCount(state);
  // Person-sol stocks -> physical reserves. No mutation of landing JSON or rule state.
  return { air: { ...createAirState(), oxygenKg: Math.min(15, state.supplies.oxygen * .84 * 24.66 / 24) },
    water: { ...createWaterState(), cleanL: Math.min(100, state.supplies.water * 3.52 * 24.66 / 24) },
    sol: state.sol, elapsedInSol: 0, crew, budget: lifePowerBudget(state), spentKWh: 0,
    airKW: 0, waterKW: 0, controls: structuredClone(DEFAULT_CONTROLS) };
}

/** Player switches on the facility computers. Every unit starts on. */
export const DEFAULT_CONTROLS = Object.freeze({
  air: Object.freeze({ fans: true, scrubber: true, producer: true }),
  water: Object.freeze({ extract: true, recycle: true }),
  greenhouse: Object.freeze({ led: 'auto', irrigation: true }),
});
// GAME ASSUMPTION (order of magnitude): ~8 m² of grow beds at ~150 W/m² LED → 1.2 kW;
// small irrigation pump 0.1 kW. Plant O₂ credit stays 0 (İhan: not validated, sistemler/README).
export const GREENHOUSE_LED_KW = 1.2, IRRIGATION_KW = .1;

/** Pure: returns support with one control changed. */
export function setLifeControl(support, system, key, value) {
  const controls = support.controls ?? DEFAULT_CONTROLS;
  if (!(system in DEFAULT_CONTROLS) || !(key in DEFAULT_CONTROLS[system])) throw new RangeError('Unknown control ' + system + '.' + key);
  return { ...support, controls: { ...controls, [system]: { ...controls[system], [key]: value } } };
}

/** LED grow lights: 'on', 'off' or 'auto' (on while the Sun is below 10° — supplemental photoperiod). */
export function greenhouseLightsOn(controls, sunElevationDeg) {
  const mode = (controls ?? DEFAULT_CONTROLS).greenhouse.led;
  return mode === 'on' || (mode === 'auto' && sunElevationDeg < 10);
}

/** Seconds at the host boundary; fixed one-minute substeps at the vendor boundary.
 * Same partition for a sol button and real-time progression; never step >24.66 h.
 */
export function stepLifeSupport(support, seconds, sunElevationDeg = 30) {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid life-support step');
  let s = { ...support };
  let remaining = seconds;
  while (remaining > 1e-8) {
    const dt = Math.min(60, remaining), hours = dt / 3600;
    const remainingEnergy = Math.max(0, s.budget.energyKWh - s.spentKWh);
    const c = s.controls ?? DEFAULT_CONTROLS;
    let available = Math.min(s.budget.powerKW, remainingEnergy / hours);
    // Greenhouse loads come off the top when the player has them on (and power exists).
    const ledOn = greenhouseLightsOn(c, sunElevationDeg) && available >= GREENHOUSE_LED_KW;
    if (ledOn) available -= GREENHOUSE_LED_KW;
    const pumpOn = c.greenhouse.irrigation && available >= IRRIGATION_KW;
    if (pumpOn) available -= IRRIGATION_KW;
    // A unit switched off at its computer never qualifies for power (threshold ∞) — İhan's model unchanged.
    const off = Number.POSITIVE_INFINITY;
    const airConfig = { ...AIR_DEFAULTS, crew: s.crew, fanPowerKW: c.air.fans ? AIR_DEFAULTS.fanPowerKW : off,
      scrubberPowerKW: c.air.scrubber ? AIR_DEFAULTS.scrubberPowerKW : off, productionPowerKW: c.air.producer ? AIR_DEFAULTS.productionPowerKW : off };
    // Fans and CO2 removal first, followed by water recovery, O2, ice extraction.
    const base = (c.air.fans ? AIR_DEFAULTS.fanPowerKW : 0) + (c.air.fans && c.air.scrubber ? AIR_DEFAULTS.scrubberPowerKW : 0);
    let airKW = Math.min(base, available), waterKW = c.water.recycle ? Math.min(WATER_DEFAULTS.recoveryKW, available - airKW) : 0;
    let rest = available - airKW - waterKW;
    if (c.air.fans && c.air.producer && rest + 1e-9 >= AIR_DEFAULTS.productionPowerKW) { airKW += AIR_DEFAULTS.productionPowerKW; rest -= AIR_DEFAULTS.productionPowerKW; }
    if (c.water.extract && rest + 1e-9 >= WATER_DEFAULTS.extractionKW) waterKW += WATER_DEFAULTS.extractionKW;
    const air = stepAir(s.air, hours, { powerKW: airKW }, airConfig);
    const water = stepWater(s.water, hours, { powerKW: waterKW, extract: c.water.extract, recycle: c.water.recycle }, { ...WATER_DEFAULTS, crew: s.crew });
    const greenhouseKWh = ((ledOn ? GREENHOUSE_LED_KW : 0) + (pumpOn ? IRRIGATION_KW : 0)) * hours;
    const used = air.energyKWh + water.energyKWh - s.air.energyKWh - s.water.energyKWh + greenhouseKWh;
    s = { ...s, air, water, airKW, waterKW, greenhouse: { ledOn, pumpOn, powerKW: (ledOn ? GREENHOUSE_LED_KW : 0) + (pumpOn ? IRRIGATION_KW : 0) },
      spentKWh: s.spentKWh + used, elapsedInSol: s.elapsedInSol + dt };
    remaining -= dt;
  }
  return s;
}

export function syncLifeSupport(support, previous, next) {
  if (next.sol < previous.sol) return createLifeSupport(next);
  let s = { ...support, crew: crewCount(next) };
  if (next.sol > previous.sol) {
    // Complete the newly calculated sol using its actual storm/generation/load row.
    s.budget = lifePowerBudget(next, previous);
    s = stepLifeSupport(s, Math.max(0, LIFE_SOL_SECONDS - s.elapsedInSol));
    s = { ...s, sol: next.sol, elapsedInSol: 0, spentKWh: 0, budget: lifePowerBudget(next) };
  }
  return s;
}

export function lifeSupportTelemetry(s) {
  return { oxygenKg: s.air.oxygenKg, waterL: s.water.cleanL, air: { ...s.air }, water: { ...s.water },
    powerKW: (s.air.powerUsedKW ?? 0) + (s.water.powerUsedKW ?? 0) + (s.greenhouse?.powerKW ?? 0),
    controls: s.controls ?? DEFAULT_CONTROLS, greenhouse: s.greenhouse ?? { ledOn: false, pumpOn: false, powerKW: 0 },
    // Reserves at the current crew demand (NASA BVAD 0.84 kg O₂, 3.52 L water per person-day).
    oxygenHours: s.crew ? s.air.oxygenKg / (s.crew * AIR_DEFAULTS.oxygenPerPersonDay / 24) : Infinity,
    waterDays: s.crew ? s.water.cleanL / (s.crew * WATER_DEFAULTS.waterPersonDay) : Infinity,
    availableKW: s.budget.powerKW, spentKWh: s.spentKWh, crew: s.crew, sol: s.sol,
    energyKWhPerGameUnit: COLONY_ENERGY_KWH };
}
