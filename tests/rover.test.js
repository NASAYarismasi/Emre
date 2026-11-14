import { describe, expect, it } from 'vitest'
import { createRoverState, commandRover, stepRover, planRoverPath, roverSegmentClear,
  ROVER_HOME, ROVER_STATIONS, ROVER_MAX_SPEED_MPS, ROVER_OBSTACLES, ROVER_TUBES,
  ROVER_WITNESS_TUBES, ROVER_GENERATOR_W, ROVER_LOAD_W, ROVER_BATTERY_KWH } from '../src/sim/rover.js'

function advance(s, seconds) { for (let i = 0; i < Math.round(seconds * 10); i++) stepRover(s, .1); return s }
function atSite(seed) { const s = createRoverState(seed); Object.assign(s, { x: ROVER_STATIONS[0].x, z: ROVER_STATIONS[0].z }); return s }

describe('Perseverance surface operations', () => {
  it('turns in place, respects physical speed and accounts for actual ground travel', () => {
    const s = createRoverState(); commandRover(s, 'drive', 'delta')
    stepRover(s, .1); expect(s.speedMps).toBe(0); expect(s.odometerM).toBe(0)
    let travelled = 0
    for (let i = 0; i < 10000; i++) {
      const x = s.x, z = s.z; stepRover(s, .1)
      const d = Math.hypot(s.x - x, s.z - z); travelled += d
      expect(s.speedMps).toBeLessThanOrEqual(ROVER_MAX_SPEED_MPS + 1e-12)
      expect(d).toBeLessThanOrEqual(ROVER_MAX_SPEED_MPS * .1 + 1e-12)
    }
    expect(s.mode).toBe('parked'); expect(s.x).toBeCloseTo(25, 6); expect(s.z).toBeCloseTo(26, 6)
    expect(s.odometerM).toBeCloseTo(travelled, 8)
  })
  it('routes every station pair and base around every dome, lander and facility', () => {
    const sites = [ROVER_HOME, ...ROVER_STATIONS]
    for (const a of sites) for (const b of sites) {
      const path = planRoverPath(a, b); expect(path.length).toBeGreaterThan(0)
      let p = a
      for (const q of path) {
        expect(roverSegmentClear(p, q)).toBe(true)
        for (let k = 0; k <= 100; k++) for (const [x, z, r] of ROVER_OBSTACLES)
          expect(Math.hypot(p.x + (q.x - p.x) * k / 100 - x, p.z + (q.z - p.z) * k / 100 - z)).toBeGreaterThanOrEqual(r - 1e-7)
        p = q
      }
    }
    expect(planRoverPath(ROVER_HOME, { x: 0, z: 0 })).toEqual([])
  })
  it('integrates generator/load energy and stops at depletion, recharges parked', () => {
    const s = createRoverState(); commandRover(s, 'drive', 'delta'); advance(s, 30)
    expect(s.batteryKWh).toBeCloseTo(ROVER_BATTERY_KWH + (ROVER_GENERATOR_W - ROVER_LOAD_W.driving) * 30 / 3600000, 9)
    s.batteryKWh = 0; stepRover(s, .1); expect(s.mode).toBe('parked'); expect(s.speedMps).toBe(0)
    advance(s, 600); expect(s.batteryKWh).toBeGreaterThan(0)
    s.batteryKWh = ROVER_BATTERY_KWH; advance(s, 10); expect(s.batteryKWh).toBe(ROVER_BATTERY_KWH)
  })
  it('limits sampling to rock tubes, reserves five witnesses and rejects remote sampling', () => {
    expect(commandRover(createRoverState(), 'sample')).toBe(false)
    const s = atSite()
    for (let i = 0; i < 50; i++) { commandRover(s, 'sample'); advance(s, 46) }
    expect(s.samples).toHaveLength(ROVER_TUBES - ROVER_WITNESS_TUBES)
    expect(s.tubesRemaining).toBe(5); expect(s.samples.every(t => t.sealed)).toBe(true)
  })
  it('acquires reproducible instrument data in order, in SI, with no life claim', () => {
    const a = atSite(77), b = atSite(77)
    for (const s of [a, b]) { expect(commandRover(s, 'analyze', 'all')).toBe(true); advance(s, 121) }
    expect(a.measurements).toEqual(b.measurements)
    expect(a.measurements.map(m => m.instrument)).toEqual(['SuperCam', 'PIXL', 'SHERLOC', 'MEDA', 'RIMFAX'])
    const weather = a.measurements[3].values
    expect(weather.pressurePa).toBeGreaterThanOrEqual(600); expect(weather.pressurePa).toBeLessThanOrEqual(750)
    expect(a.measurements[2].values.confirmedLife).toBe(false)
    expect(a.instrumentQueue).toEqual([]); expect(a.mode).toBe('parked')
    const c = atSite(78); commandRover(c, 'analyze', 'all'); advance(c, 121)
    expect(c.measurements).not.toEqual(a.measurements)
  })
  it('supports interruption and return, rejects invalid steps/instruments', () => {
    const s = atSite(); commandRover(s, 'analyze', 'all'); commandRover(s, 'park'); advance(s, 200)
    expect(s.measurements).toEqual([]); expect(s.instrumentQueue).toEqual([])
    expect(commandRover(s, 'analyze', 'invalid')).toBe(false)
    expect(commandRover(s, 'return')).toBe(true); expect(s.target.id).toBe('base')
    expect(() => stepRover(s, -1)).toThrow(); expect(() => stepRover(s, Infinity)).toThrow()
  })
})
