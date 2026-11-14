/** IHAN-SRC — host wiring for İhan's a7d5ce6 air/water models. No DOM/Three.js. */
import { LED_KW, DRILL_KW } from '../colony/ihan/mars-power.mjs';
import { POWER_SWITCHES, createPower, powerSupply, settlePower, powerTelemetry } from './colonyPower.js';
import { AIR_DEFAULTS, WATER_DEFAULTS, createAirState, createWaterState, stepAir, stepWater } from './ihanLifeSupportModels.js';

export const LIFE_SOL_SECONDS = 24.66 * 3600;
// GAME ASSUMPTION: one colony energy unit represents 12 kWh for this physical
// projection. The original colony rules remain in educational energy units.
export const COLONY_ENERGY_KWH = 12;
const crewCount = state => state.crew.filter(p => p.health > 0).length;

export function lifePowerBudget(state) {
  const storm = Boolean(state.timeline.at(-1)?.storm);
  // Physical supply comes from the fixed 420-panel farm, never the educational ledger.
  return { physical: true, storm, energyKWh: Infinity, powerKW: 0 };

}

export function createLifeSupport(state) {
  const crew = crewCount(state);
  // Person-sol stocks -> physical reserves. No mutation of landing JSON or rule state.
  return { air: { ...createAirState(), oxygenKg: Math.min(15, state.supplies.oxygen * .84 * 24.66 / 24) },
    water: { ...createWaterState(), cleanL: Math.min(100, state.supplies.water * 3.52 * 24.66 / 24) },
    sol: state.sol, elapsedInSol: 0, crew, budget: lifePowerBudget(state), spentKWh: 0,
    airKW: 0, waterKW: 0, power: createPower(state.startupEnergy * COLONY_ENERGY_KWH), controls: structuredClone(DEFAULT_CONTROLS) };
}

/** Player switches on the facility computers. Every unit starts on. */
export const DEFAULT_CONTROLS = Object.freeze({
  power: POWER_SWITCHES,
  air: Object.freeze({ fans: true, scrubber: true, producer: true }),
  water: Object.freeze({ extract: true, recycle: true }),
  greenhouse: Object.freeze({ led: 'auto', irrigation: true }),
});
// IHAN-SRC: six 1.28 ? 2.37 m trays, PPFD 350, source/assumptions in mars-power.mjs.
export const GREENHOUSE_LED_KW = LED_KW;
export const IRRIGATION_KW = .1; // GAME ASSUMPTION: small irrigation pump.
// stepWater remains sistemler/su.mjs: 20 L/6 h, 50% ice. The ed79956 power
// forecast uses 10% ice + sublimation (~1.88 kWh/L). These are distinct projections;
// DRILL_KW agrees (2 kW), but forecast liters must never replace actual extractedL.

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
    if (s.budget.physical) { s = stepPoweredFacilities(s, hours, sunElevationDeg); remaining -= dt; continue; }
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
    // GAME ASSUMPTION: the sol-button forecast starts at 08:00, with the same
    // normalized 12.33 h daylight profile as mars-power. Real-time uses Mars24.
    while (s.elapsedInSol < LIFE_SOL_SECONDS - 1e-8) {
      const localHour = (8 + s.elapsedInSol / 3600) % 24.66;
      const phase = (localHour - 6) / 12.33;
      const elevation = phase > 0 && phase < 1 ? 90 - Math.abs(90 - phase * 180) : -10;
      s = stepLifeSupport(s, Math.min(60, LIFE_SOL_SECONDS - s.elapsedInSol), elevation);
    }
    s = { ...s, sol: next.sol, elapsedInSol: 0, spentKWh: 0, budget: lifePowerBudget(next) };
  }
  return s;
}

export function lifeSupportTelemetry(s) {
  return { oxygenKg: s.air.oxygenKg, waterL: s.water.cleanL, air: { ...s.air }, water: { ...s.water },
    powerKW: s.budget.physical ? (s.power.habitatKW ?? 0) + (s.power.loadKW ?? 0)
      : (s.air.powerUsedKW ?? 0) + (s.water.powerUsedKW ?? 0) + (s.greenhouse?.powerKW ?? 0),
    power: powerTelemetry(s.power, (s.controls ?? DEFAULT_CONTROLS).power),
    controls: s.controls ?? DEFAULT_CONTROLS, greenhouse: s.greenhouse ?? { ledOn: false, pumpOn: false, powerKW: 0 },
    // Reserves at the current crew demand (NASA BVAD 0.84 kg O₂, 3.52 L water per person-day).
    oxygenHours: s.crew ? s.air.oxygenKg / (s.crew * AIR_DEFAULTS.oxygenPerPersonDay / 24) : Infinity,
    waterDays: s.crew ? s.water.cleanL / (s.crew * WATER_DEFAULTS.waterPersonDay) : Infinity,
    availableKW: s.availableKW ?? s.budget.powerKW, spentKWh: s.spentKWh, crew: s.crew, sol: s.sol,
    energyKWhPerGameUnit: COLONY_ENERGY_KWH };
}

/** One minute or less, branch allocation before the vendor models are advanced. */
function stepPoweredFacilities(s, hours, elevation) {
  const c = s.controls ?? DEFAULT_CONTROLS;
  const supply = powerSupply(s.power, c.power, elevation, s.budget.storm, hours);
  // IHAN-SRC: habitat envelope 60 kWh/daylight and 6 kW/night includes air/recovery.
  // GAME ASSUMPTION: its remainder is other habitat equipment; avoid double-counting
  // the air plant and recycler, which are individually switchable and metered below.
  const auxiliaryKW = supply.habitatEnvelopeKW - AIR_DEFAULTS.fanPowerKW - AIR_DEFAULTS.scrubberPowerKW
    - AIR_DEFAULTS.productionPowerKW - WATER_DEFAULTS.recoveryKW;
  const baseKW = Math.min(auxiliaryKW, supply.habitatKW);
  let habitat = Math.max(0, supply.habitatKW - baseKW);
  const off = Infinity;
  const config = { ...AIR_DEFAULTS, crew: s.crew, fanPowerKW: c.air.fans ? AIR_DEFAULTS.fanPowerKW : off,
    scrubberPowerKW: c.air.scrubber ? AIR_DEFAULTS.scrubberPowerKW : off,
    productionPowerKW: c.air.producer ? AIR_DEFAULTS.productionPowerKW : off };
  const air = stepAir(s.air, hours, { powerKW: habitat }, config);
  habitat = Math.max(0, habitat - air.powerUsedKW);
  const recycleKW = c.water.recycle && habitat + 1e-9 >= WATER_DEFAULTS.recoveryKW ? WATER_DEFAULTS.recoveryKW : 0;
  let load = supply.loadKW;
  const drillOn = c.water.extract && load + 1e-9 >= DRILL_KW;
  if (drillOn) load -= DRILL_KW;
  const ledOn = greenhouseLightsOn(c, elevation) && load + 1e-9 >= LED_KW;
  if (ledOn) load -= LED_KW;
  const pumpOn = c.greenhouse.irrigation && load + 1e-9 >= IRRIGATION_KW;
  const water = stepWater(s.water, hours, { powerKW: recycleKW + (drillOn ? DRILL_KW : 0), extract: drillOn, recycle: recycleKW > 0 }, { ...WATER_DEFAULTS, crew: s.crew });
  const actualDrillKW = (water.extractedL - s.water.extractedL) / WATER_DEFAULTS.litersPerHour * DRILL_KW / hours;
  const greenhouseKW = (ledOn ? LED_KW : 0) + (pumpOn ? IRRIGATION_KW : 0);
  const usedHabitatKW = baseKW + air.powerUsedKW + Math.max(0, water.powerUsedKW - actualDrillKW);
  const usedLoadKW = actualDrillKW + greenhouseKW;
  const power = settlePower(s.power, c.power, supply, hours, usedHabitatKW, usedLoadKW);
  return { ...s, air, water, airKW: air.powerUsedKW, waterKW: water.powerUsedKW,
    power: { ...power, auxiliaryKW: baseKW, habitatKW: usedHabitatKW, loadKW: usedLoadKW, directKW: supply.directKW, storageKW: supply.storageKW,
      drillKW: actualDrillKW, ledKW: ledOn ? LED_KW : 0 },
    greenhouse: { ledOn, pumpOn, powerKW: greenhouseKW }, availableKW: supply.habitatKW + supply.loadKW,
    spentKWh: s.spentKWh + (usedHabitatKW + usedLoadKW) * hours, elapsedInSol: s.elapsedInSol + hours * 3600 };
}
