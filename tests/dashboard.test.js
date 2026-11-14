import { describe, expect, it } from 'vitest';
import { appendHistory, mapBaseMarkers, mapDashboardTelemetry, mapTimeline, sparklinePoints } from '../src/colony/dashboard.mjs';
import { LIFE_SOL_SECONDS } from '../src/sim/colonyLifeSupport.js';

const fake = () => ({
  state: { sol: 2, battery: 9, startupEnergy: 0, supplies: { food: 12, water: 15, oxygen: 9 },
    crew: [{ id: 'a', health: 100, role: 'maintenance' }, { id: 'b', health: 70 }, { id: 'c', health: 0 }],
    placed: [{ type: 'habitat', position: { x: 7, z: 12 } }],
    timeline: [
      { sol: 1, generation: 12, used: 7, battery: 5, needs: { food: true, water: true, oxygen: true }, produced: { food: 3, water: 2, oxygen: 3 }, supplies: { food: 15, water: 16, oxygen: 9 } },
      { sol: 2, generation: 4, used: 8, battery: 9, needs: { food: true, water: false, oxygen: true }, produced: { food: 0, water: 2, oxygen: 3 }, supplies: { food: 12, water: 15, oxygen: 9 } },
    ] },
  environment: { lmst: 12.5, sunElevationDeg: 45, storm: true, warp: 10 },
  lifeSupport: { oxygenKg: 4, waterL: 20, oxygenHours: 38, waterDays: 2, availableKW: 6, powerKW: 4, spentKWh: 7,
    air: { co2Kg: .2, generatedKg: 1, consumedKg: 2, removedCO2Kg: 3, elapsedHours: 48, powerUsedKW: 2.8, fans: true, scrubber: false, producer: true },
    water: { iceKg: 900, extractedL: 7, recoveredL: 3, consumedL: 9, powerUsedKW: 0, extractor: false, recycler: false },
    controls: { air: { fans: true, scrubber: false, producer: true }, water: { extract: true, recycle: true }, greenhouse: { led: 'auto', irrigation: true } },
    greenhouse: { ledOn: true, pumpOn: false, powerKW: 1.2 } },
  crewAgents: [{ index: 0, x: 2, z: 3, mode: 'working', site: 'solar' }, { index: 1, x: 5, z: 8, mode: 'walking', site: 'air' }],
  playerId: 'a', player: { x: 2, y: 1.6, z: 3 },
});

describe('dashboard read-only telemetry projection', () => {
  it('keeps physical reserves, person-sol stocks and educational energy separate', () => {
    const telemetry = fake(), before = structuredClone(telemetry);
    const s = mapDashboardTelemetry(telemetry);
    expect(s.alive).toBe(2);
    expect(s.supplies.map(r => r.sols)).toEqual([6, 7.5, 4.5]);
    expect(s.oxygenKg).toBe(4); expect(s.waterDays).toBe(2);
    expect(s.power).toMatchObject({ available: 6, used: 4, battery: 9, generation: 4, colonyUsed: 8, spentKWh: 7 });
    expect(s.crew[0]).toMatchObject({ player: true, roleLabel: 'Bakım', mode: 'working', site: 'solar' });
    expect(s.lamps.map(l => l.status)).toEqual(['running','off','running','standby','standby','running','standby']);
    expect(s.storm).toBe(true); expect(s.temperatureC).toBeLessThan(0);
    expect(telemetry).toEqual(before);
  });
  it('handles startup, absent rover and exhausted crew without inventing zero readings', () => {
    const s = mapDashboardTelemetry();
    expect(s.connected).toBe(false); expect(s.rover).toBeNull();
    expect(s.oxygenKg).toBeNull(); expect(s.power.used).toBeNull();
    expect(s.supplies.every(r => r.stock === null && r.sols === null)).toBe(true);
    expect(s.lamps.every(l => l.status === 'unknown')).toBe(true);
    const t = fake(); t.state.crew.forEach(p => { p.health = 0; });
    expect(mapDashboardTelemetry(t).report.status).toBe('failed');
    expect(mapDashboardTelemetry(t).supplies[0].sols).toBeNull();
  });
  it('uses the same success and failure criteria as the colony report', () => {
    const t = fake(); t.state.crew.forEach(p => { p.health = 100; });
    t.state.sol = 10;
    expect(mapDashboardTelemetry(t).report.status).toBe('failed');
    t.state.timeline.forEach(row => { row.needs.water = true; });
    expect(mapDashboardTelemetry(t).report.status).toBe('success');
  });
  it('accepts rover events, orders measurements latest first and prefers polled rover', () => {
    const rover = { position: [20, 0, -8], mode: 'driving', odometerM: 80, batteryKWh: 1.4, samples: ['tube-1'], measurements: [{ value: 1 }, { value: 2 }] };
    const s = mapDashboardTelemetry(fake(), rover);
    expect(s.rover.position).toEqual({ x: 20, z: -8 });
    expect(s.rover.samples).toBe(1); expect(s.rover.measurements[0].value).toBe(2);
    expect(rover.measurements[0].value).toBe(1);
    expect(mapDashboardTelemetry({ ...fake(), rover: { ...rover, batteryKWh: 2 } }, rover).rover.batteryKWh).toBe(2);
  });
  it('maps live coordinates while identifying fixed installation markers', () => {
    const s = mapDashboardTelemetry(fake(), { position: { x: 50, z: 60 } });
    const markers = mapBaseMarkers(s);
    expect(markers.find(p => p.kind === 'module')).toMatchObject({ x: 7, z: 12 });
    expect(markers.filter(p => p.kind === 'crew')).toHaveLength(1);
    expect(markers.find(p => p.kind === 'player')).toMatchObject({ x: 2, z: 3 });
    expect(markers.find(p => p.kind === 'rover')).toMatchObject({ x: 50, z: 60 });
    expect(markers.filter(p => p.fixed)).toHaveLength(8);
  });
});

describe('dashboard ledger and rolling trends', () => {
  it('reconstructs measured consumption from balances, leaving unknown first-sol demand absent', () => {
    const rows = mapTimeline(fake().state);
    expect(rows[0]).toMatchObject({ produced: 8, consumed: null, needsMet: true });
    expect(rows[1]).toMatchObject({ produced: 5, consumed: 9, needsMet: false });
  });
  it('bounds history to two simulated sols, coalesces minutes and resets on time reversal', () => {
    const point = time => ({ time, oxygenKg: 4, waterL: 20, power: { used: 3 } });
    let history = appendHistory([], point(0));
    history = appendHistory(history, point(20));
    expect(history).toHaveLength(1); expect(history[0].time).toBe(20);
    history = appendHistory(history, point(60)); expect(history).toHaveLength(2);
    history = appendHistory(history, point(2 * LIFE_SOL_SECONDS + 61)); expect(history).toHaveLength(1);
    history = appendHistory(history, point(0)); expect(history).toHaveLength(1); expect(history[0].time).toBe(0);
  });
  it('produces finite, time-spaced SVG coordinates and no fabricated startup trend', () => {
    expect(sparklinePoints([{ time: 0, waterL: 1 }], 'waterL')).toBe('');
    expect(sparklinePoints([{ time: 0, waterL: 1 }, { time: 20, waterL: 2 }, { time: 60, waterL: 3 }], 'waterL')).toBe('0,26 60,14 180,2');
    expect(sparklinePoints([{ time: 0, waterL: 2 }, { time: 60, waterL: 2 }], 'waterL')).not.toMatch(/NaN|Infinity/);
  });
});
