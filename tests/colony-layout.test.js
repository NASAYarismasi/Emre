import { describe, expect, it } from 'vitest'
import { LANDER_PAD, COMMS_PAD, LANDER_SPAWN, COLONY_SPAWN, ARRIVAL_YAW, FACILITY_KEEPOUTS,
  PAD_KEEPOUTS, beaconOnAt } from '../src/data/colonyLayout.js'
import { ROVER_HOME, ROVER_OBSTACLES, ROVER_STATIONS, planRoverPath, roverSegmentClear } from '../src/sim/rover.js'
import { CREW_SITES, CREW_OBSTACLES, planPath } from '../src/colony/scene/crew-npc.mjs'
import { getTerrainHeight } from '../src/colony/ihan/crater-ecosystem.mjs'

describe('shared surface layout', () => {
  it('separates the entire pads from every fixed keep-out, each other, crew sites and rover parking', () => {
    expect(Math.hypot(COMMS_PAD.x, COMMS_PAD.z)).toBeGreaterThanOrEqual(35)
    expect(Math.hypot(COMMS_PAD.x, COMMS_PAD.z)).toBeLessThanOrEqual(60)
    expect(Math.hypot(LANDER_PAD.x, LANDER_PAD.z)).toBeGreaterThanOrEqual(70)
    expect(Math.hypot(LANDER_PAD.x, LANDER_PAD.z)).toBeLessThanOrEqual(120)
    for (const pad of [LANDER_PAD, COMMS_PAD]) {
      for (const [x,z,r] of FACILITY_KEEPOUTS) expect(Math.hypot(x-pad.x,z-pad.z)).toBeGreaterThan(pad.radius+r)
      for (const obstacles of [ROVER_OBSTACLES,CREW_OBSTACLES]) for (const [x,z,r] of obstacles) {
        if (x===pad.x && z===pad.z) continue // The pad's own exclusion circle.
        expect(Math.hypot(x-pad.x,z-pad.z)).toBeGreaterThan(pad.radius+r)
      }
      for (const site of [...Object.values(CREW_SITES), ROVER_HOME])
        expect(Math.hypot(site.x-pad.x,site.z-pad.z)).toBeGreaterThan(pad.radius+3)
      // Both pads are entirely inside the first 150 m survey ring, never on its start.
      expect(Math.hypot(pad.x-ROVER_HOME.x,pad.z-ROVER_HOME.z)+pad.radius).toBeLessThan(150)
      const heights = Array.from({length:32},(_,i)=>getTerrainHeight(pad.x+pad.radius*Math.cos(i*Math.PI/16),pad.z+pad.radius*Math.sin(i*Math.PI/16)))
      expect(Math.max(...heights)-Math.min(...heights)).toBeLessThan(.3)
    }
  })
  it('spawns outside hull/feet at the +Z ladder and looks directly toward the habitat', () => {
    expect(LANDER_SPAWN).toEqual({x:LANDER_PAD.x,z:LANDER_PAD.z+9})
    const distance=Math.hypot(COLONY_SPAWN.x,COLONY_SPAWN.z)
    expect(-Math.sin(ARRIVAL_YAW)).toBeCloseTo(-COLONY_SPAWN.x/distance)
    expect(-Math.cos(ARRIVAL_YAW)).toBeCloseTo(-COLONY_SPAWN.z/distance)
    expect(distance).toBeLessThan(25) // start at the colony
    for (const sx of [-1,1]) for (const sz of [-1,1])
      expect(Math.hypot(LANDER_SPAWN.x-LANDER_PAD.x-sx*8.5/Math.sqrt(2),LANDER_SPAWN.z-LANDER_PAD.z-sz*8.5/Math.sqrt(2))).toBeGreaterThan(1.48)
  })
  it('keeps every NPC work route and commanded rover route clear of the new pads', () => {
    const pads=PAD_KEEPOUTS.map(([x,z,r])=>[x,z,r+.1])
    for (const a of Object.values(CREW_SITES)) for (const b of Object.values(CREW_SITES)) {
      const path=[a,...planPath(a,b)]
      for (let i=1;i<path.length;i++) expect(roverSegmentClear(path[i-1],path[i],pads)).toBe(true)
    }
    for (const destination of [...ROVER_STATIONS, {x:LANDER_PAD.x,z:LANDER_PAD.z-25}, {x:COMMS_PAD.x-20,z:COMMS_PAD.z}]) {
      const path=[ROVER_HOME,...planRoverPath(ROVER_HOME,destination)]
      expect(path.length).toBeGreaterThan(1)
      for (let i=1;i<path.length;i++) expect(roverSegmentClear(path[i-1],path[i])).toBe(true)
    }
  })
  it('pulses at 40 flashes/minute with a definite dark interval, independent of sol warp', () => {
    for (const start of [0,1.5,3,15,90]) {
      expect(beaconOnAt(start)).toBe(true)
      expect(beaconOnAt(start+.15)).toBe(true)
      expect(beaconOnAt(start+.5)).toBe(false)
      expect(beaconOnAt(start+1.4)).toBe(false)
    }
  })
})
