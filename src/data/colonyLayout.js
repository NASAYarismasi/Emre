// GAME ASSUMPTION: compact, playable Düz Ova plan; metres, +X east, -Z north.
// Plume/ejecta separation rationale: NASA Mars DRA 5.0, not a validated safety distance.
// https://www.nasa.gov/wp-content/uploads/2015/09/373667main_NASA-SP-2009-566-ADD.pdf
// The ~92 m lander offset is deliberately shorter than the study's ~1 km separation.
export const LANDER_PAD = Object.freeze({ x: -16, z: -91, radius: 14 })
export const COMMS_PAD = Object.freeze({ x: -38, z: -27, radius: 7 })
export const LANDER_SPAWN = Object.freeze({ x: LANDER_PAD.x, z: LANDER_PAD.z + 9 })
export const ARRIVAL_YAW = Math.atan2(LANDER_SPAWN.x, LANDER_SPAWN.z)
export const ROVER_PARK = Object.freeze({ x: 5.75, z: 14.5 })
// Conservative circles for the fixed buildings and array footprint.
export const FACILITY_KEEPOUTS = [
  [0, 0, 15.3], [19, 26, 11.3], [19, 6, 4.6], [64, -26, 4.8], [-57, 46, 31],
]
// Paired ground cables stay on the north service edge, away from the arrival corridor.
export const COMMS_CABLE_ROUTE = [[-35, -25.65], [-35, -15], [-16, -15], [-16, -5], [-11.8, -2.4]]
export const ARRIVAL_ROUTE = [LANDER_SPAWN, { x: -17, z: -18 }, { x: -17, z: 9 }, { x: -2, z: 13 }]
export const PAD_KEEPOUTS = [
  [LANDER_PAD.x, LANDER_PAD.z, LANDER_PAD.radius],
  [COMMS_PAD.x, COMMS_PAD.z, COMMS_PAD.radius],
]
// GAME ASSUMPTION: 40 visible pulses/minute; cosmetic marker uses real seconds, independent of sol warp.
export const beaconOnAt = seconds => ((seconds % 1.5) + 1.5) % 1.5 < .28
