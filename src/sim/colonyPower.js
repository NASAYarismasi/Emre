/** Runtime wiring of İhan's ed79956 forecast. Pure; vendor boundary uses kW/kWh/h.
 * GAME ASSUMPTION: initial physical storage is landing energy × host conversion,
 * capped at 180 kWh. It never reads the educational battery as an ongoing supply.
 */
import { DAYLIGHT_HOURS, LED_KW, DRILL_KW, solarEnergy, powerForecast } from '../colony/ihan/mars-power.mjs';

export const BATTERY_KWH = 180; // GAME ASSUMPTION: İhan's design capacity.
export const POWER_SWITCHES = Object.freeze({ main: true, batterySupport: true,
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['inv' + (i + 1), true])) });
export function createPower(initialKWh) {
  return { batteryKWh: Math.max(0, Math.min(BATTERY_KWH, initialKWh)), solarKW: 0,
    transmission: 1, directKWh: 0, backupKWh: 0, chargedKWh: 0, habitatKWh: 0, unservedKWh: 0 };
}

/** Normalized sine profile has the same integral as İhan's solarEnergy.
 * GAME ASSUMPTION: elevation maps the equinox daylight profile onto the Mars24 sun.
 * Storm transmission .2 is İhan's stand-alone example, not a measured weather value.
 */
export function powerSupply(power, switches, elevationDeg, storm, hours) {
  const transmission = storm ? .2 : 1;
  const solarKW = solarEnergy(42, transmission) / DAYLIGHT_HOURS * Math.PI / 2
    * Math.max(0, Math.sin(elevationDeg * Math.PI / 180));
  const enabled = i => switches['inv' + i] !== false;
  const directKW = solarKW * [1, 2].filter(enabled).length / 10;
  const storageKW = solarKW * Array.from({ length: 8 }, (_, i) => i + 3).filter(enabled).length / 10;
  const batteryKW = power.batteryKWh / hours;
  // Habitat branch remains connected when the greenhouse/drill main breaker opens.
  const habitatEnvelopeKW = elevationDeg > 0 ? 60 / DAYLIGHT_HOURS : 6;
  const habitatKW = Math.min(habitatEnvelopeKW, storageKW + batteryKW);
  const surplusKW = Math.max(0, storageKW - habitatEnvelopeKW);
  const loadKW = switches.main ? Math.min(DRILL_KW + LED_KW + .1,
    directKW + (switches.batterySupport ? Math.max(0, batteryKW - Math.max(0, habitatEnvelopeKW - storageKW)) + surplusKW : 0)) : 0;
  return { transmission, solarKW, directKW, storageKW, habitatKW, habitatEnvelopeKW, loadKW };
}

/** Commit only energy actually consumed; storage never creates energy at a sol boundary. */
export function settlePower(power, switches, supply, hours, habitatKW, loadKW) {
  const directKW = switches.main ? Math.min(loadKW, supply.directKW) : 0;
  const deficitKW = Math.max(0, habitatKW + loadKW - directKW - supply.storageKW);
  const surplusKW = Math.max(0, supply.storageKW - habitatKW - (loadKW - directKW));
  const discharge = Math.min(power.batteryKWh, deficitKW * hours);
  const charge = Math.min(BATTERY_KWH - power.batteryKWh, surplusKW * hours * .9);
  return { ...power, batteryKWh: power.batteryKWh + charge - discharge,
    solarKW: supply.solarKW, transmission: supply.transmission,
    directKWh: power.directKWh + directKW * hours, backupKWh: power.backupKWh + Math.max(0, loadKW - directKW) * hours,
    chargedKWh: power.chargedKWh + charge, habitatKWh: power.habitatKWh + habitatKW * hours };
}

export function powerTelemetry(power, switches) {
  return { ...power, capacityKWh: BATTERY_KWH, batteryPercent: power.batteryKWh / BATTERY_KWH * 100,
    switches: { ...switches }, forecast: powerForecast(power.transmission, switches.main, switches) };
}
