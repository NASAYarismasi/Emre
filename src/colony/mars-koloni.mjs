import { rates } from "./mars-gorev-plani.mjs"

// Colony resources are person-sol equivalents. Equipment values model game behavior.
export const modules = {
  habitat: { name: "Yaşam modülü", detail: "Yaşam alanı · 2 enerji" },
  solarPanel: { name: "Güneş paneli", detail: "Normalde 12, fırtınada 4 enerji" },
  battery: { name: "Batarya", detail: "26 enerjiye kadar depolar" },
  oxygenUnit: { name: "Oksijen ünitesi", detail: "Görev planında su elektroliziyle oksijen üretir." },
  airScrubber: { name: "CO₂ tutucu", detail: "Kabin havasından karbondioksiti ayırır." },
  waterRecycler: { name: "Su geri dönüşümü", detail: "Görev planında kullanılmış suyu geri kazanır." },
  greenhouse: { name: "Sera", detail: "Görev planında tarım kabinlerinin ışık ve iklimini sağlar." },
  potatoPod: { name: "Patates kabini", detail: "Kapalı tarım · 2 üretim solu" },
  beanPod: { name: "Fasulye kabini", detail: "Kapalı tarım · 2 üretim solu" },
  treePod: { name: "Bodur elma kabini", detail: "Kapalı tarım · 3 üretim solu" },
}
export const roles = { construction: "İnşaat", maintenance: "Bakım", production: "Üretim" }
export const exampleLanding = {
  crew: [1, 2, 3].map(index => ({ id: "astronaut-" + index, health: 100 })),
  supplies: { food: 12, water: 12, oxygen: 12, spareParts: 1 },
  modules: ["habitat", "solarPanel", "battery", "oxygenUnit", "waterRecycler", "greenhouse"],
  landingSite: "flat",
  surfaceEnergy: 8,
}
export const missionLength = 10
export const gridSize = 6
export const siteRadius = 52
export const footprints = {
  habitat: { x: 2.6, z: 2.6 },
  solarPanel: { x: 1.1, z: 1.1 },
  battery: { x: 1.65, z: 1.55 },
  oxygenUnit: { x: 1.65, z: 1.55 },
  airScrubber: { x: 1.65, z: 1.55 },
  waterRecycler: { x: 1.65, z: 1.55 },
  greenhouse: { x: 1.65, z: 1.55 },
  potatoPod: { x: .92, z: .78 },
  beanPod: { x: .92, z: .78 },
  treePod: { x: 1.08, z: .98 },
}
export const roofSize = { x: 1.7, z: 1.7 }
const resources = ["water", "oxygen", "food"]
const labels = { water: "Su", oxygen: "Oksijen", food: "Yiyecek", cleanAir: "CO₂ giderimi" }
const producer = { water: "waterRecycler", oxygen: "oxygenUnit", food: "greenhouse" }
const blockedCells = new Set(["0:0", "1:0", "5:1", "0:4", "4:5", "5:5"])

export function createColony(landing) {
  if (!landing || !Array.isArray(landing.crew) || landing.crew.length !== 3 ||
      landing.crew.some(person => typeof person?.id !== "string" || !person.id ||
        !Number.isFinite(person.health) || person.health < 0 || person.health > 100) ||
      new Set(landing.crew.map(person => person.id)).size !== 3 ||
      !Array.isArray(landing.modules) || !landing.modules.every(id => Object.hasOwn(modules, id)) ||
      typeof landing.landingSite !== "string" ||
      ![landing.surfaceEnergy, ...[...resources, "spareParts"].map(key => landing.supplies?.[key])]
        .every(value => Number.isFinite(value) && value >= 0)) {
    throw new TypeError("Ortak iniş verisi geçersiz.")
  }
  const seen = new Map()
  const inventory = landing.modules.map(type => {
    const index = (seen.get(type) ?? 0) + 1
    seen.set(type, index)
    return { id: type + "-" + index, type }
  })
  return {
    sol: 0, landingSite: landing.landingSite, startupEnergy: landing.surfaceEnergy,
    battery: 0, supplies: { ...landing.supplies },
    crew: landing.crew.map(person => ({ ...person, role: null })),
    inventory, placed: [], timeline: [],
  }
}

// Emre's flight payload uses crew-days. Colony production and consumption use person-days.
export function createColonyFromFlight(landing) {
  const state = createColony(landing)
  for (const key of resources) state.supplies[key] *= state.crew.length
  return state
}

export function worldPlacement(item) {
  if (item.position) return item.position
  return { x: (item.x - (gridSize - 1) / 2) * 4, z: (item.z - (gridSize - 1) / 2) * 4 }
}

function legacyPlacementError(state, type, x, z) {
  if (![x, z].every(value => Number.isInteger(value) && value >= 0 && value < gridSize) ||
      blockedCells.has(x + ":" + z)) return "Bu konuma modül kurulamaz."
  if (state.placed.some(item => item.x === x && item.z === z)) return "Bu hücre dolu."
  return surfaceError({ placed: state.placed.filter(item => item.position) }, type, worldPlacement({ x, z }))
}

function surfaceError(state, type, position) {
  const { x, z, supportId } = position
  const size = footprints[type]
  if (![x, z].every(Number.isFinite) || Math.abs(x) + size.x > siteRadius || Math.abs(z) + size.z > siteRadius) {
    return "Modülün tamamını arazi sınırları içine getir."
  }
  if (supportId != null) {
    const base = state.placed.find(item => item.id === supportId)
    if (base?.type !== "habitat" || type !== "solarPanel") return "Bu çatı güneş paneli için ayrılmıştır."
    const center = worldPlacement(base)
    if (Math.abs(x - center.x) + size.x > roofSize.x || Math.abs(z - center.z) + size.z > roofSize.z) {
      return "Panelin tamamını çatı montaj alanına getir."
    }
  }
  for (const item of state.placed) {
    const other = worldPlacement(item)
    if ((other.supportId ?? null) !== (supportId ?? null)) continue
    const footprint = footprints[item.type]
    if (Math.abs(x - other.x) < size.x + footprint.x && Math.abs(z - other.z) < size.z + footprint.z) {
      return "Bu konum bir modülle çakışıyor."
    }
  }
  return ""
}

export function placementError(state, id, position, z) {
  if (state.sol >= missionLength) return "Görev sona erdi."
  const module = state.inventory.find(item => item.id === id)
  if (!module) return "Envanterden bir modül seç."
  if (typeof position === "number") return legacyPlacementError(state, module.type, position, z)
  if (!position || typeof position !== "object") return "Geçerli bir yüzeye bak."
  return surfaceError(state, module.type, position)
}

export function placeModule(state, id, position, z) {
  const error = placementError(state, id, position, z)
  if (error) throw new RangeError(error)
  const module = state.inventory.find(item => item.id === id)
  const location = typeof position === "number" ? { x: position, z } : {
    position: { x: position.x, z: position.z, supportId: position.supportId ?? null },
  }
  return {
    ...state,
    inventory: state.inventory.filter(item => item.id !== id),
    placed: [...state.placed, { ...module, ...location, active: false }],
  }
}

export function assignAstronaut(state, id, role) {
  if (state.sol >= missionLength || (role !== null && !Object.hasOwn(roles, role)) ||
      !state.crew.some(person => person.id === id && person.health > 0)) {
    throw new RangeError("Astronot veya görev seçimi geçersiz.")
  }
  return { ...state, crew: state.crew.map(person => person.id === id ? { ...person, role } : person) }
}

export function advanceSol(state, { prioritizeLifeSupport = true } = {}) {
  if (state.sol >= missionLength || !state.crew.some(person => person.health > 0)) return state
  const sol = state.sol + 1
  const storm = sol >= 5 && sol <= 8
  const living = state.crew.filter(person => person.health > 0)
  const workers = role => living.filter(person => person.role === role).length
  // Each construction assignment deploys one pair of preassembled cargo units.
  let buildSlots = workers("construction") * 2
  const installed = new Set(state.placed.filter(item => item.active).map(item => item.id))
  const placed = state.placed.map(item => {
    if (item.active || buildSlots === 0) return item
    if (item.position?.supportId && !installed.has(item.position.supportId)) return item
    buildSlots -= 1
    installed.add(item.id)
    return { ...item, active: true }
  })
  const active = type => placed.filter(item => item.active && item.type === type).length
  const panelOutput = storm ? 4 : 12
  const generation = active("solarPanel") * panelOutput
  const capacity = active("battery") * 26
  let available = state.startupEnergy + state.battery + generation
  let used = 0
  function power(amount) {
    if (available < amount) return false
    available -= amount
    used += amount
    return true
  }

  const supplies = { ...state.supplies }
  // Optional maintenance is a two-unit load. One spare part can restore two
  // more units of output during a storm when a panel and a maintainer are available.
  function maintenance() {
    if (workers("maintenance") && active("solarPanel") && power(2) && storm && supplies.spareParts >= 1) {
      supplies.spareParts -= 1
      available += 2
      return 2
    }
    return 0
  }
  let maintenanceBoost = prioritizeLifeSupport ? 0 : maintenance()
  const shelter = Boolean(active("habitat") && power(2))
  const produced = { water: 0, oxygen: 0, food: 0 }
  const operations = state.operations
  const needs = { habitat: shelter }
  let cropPower = false
  let wastewater = state.wastewater ?? 0
  const systems = []
  if (operations) {
    needs.cleanAir = Boolean(shelter && active("airScrubber") && power(1))
    if (needs.cleanAir) systems.push("CO₂ tutucu çalıştı")
    if (shelter && active("waterRecycler") && wastewater > 0 && power(2)) {
      produced.water = Math.min(wastewater, 5) * .85
      wastewater -= produced.water / .85
      supplies.water += produced.water
      systems.push("Atık sudan su geri kazanıldı")
    }
    const waterPerOxygen = (9 / 8) * rates.oxygen / rates.water
    const demandWater = living.length * (1 + .16 * operations.driedMealShare)
    if (shelter && active("oxygenUnit") && supplies.water >= demandWater + living.length * waterPerOxygen && power(3)) {
      produced.oxygen = living.length
      supplies.water -= produced.oxygen * waterPerOxygen
      supplies.oxygen += produced.oxygen
      systems.push("Su elektrolizi oksijen sağladı")
    }
    cropPower = Boolean(shelter && workers("production") && active("greenhouse") && power(2))
    if (cropPower) systems.push("Sera ışığı ve iklim kontrolü açık")
  } else if (workers("production")) {
    for (const key of resources) {
      if (active(producer[key]) && power(2)) {
        produced[key] = 3
        supplies[key] += 3
      }
    }
  }
  if (prioritizeLifeSupport) maintenanceBoost = maintenance()

  cropPower ||= !operations && produced.food > 0
  for (const key of resources) {
    const demand = living.length * (operations && key === "water" ? 1 + .16 * operations.driedMealShare : 1)
    const consumed = Math.min(supplies[key], demand)
    needs[key] = supplies[key] + 1e-9 >= demand
    supplies[key] = Math.max(0, supplies[key] - demand)
    if (operations && key === "water" && shelter) wastewater += consumed
  }
  const missing = Object.entries(needs).filter(([, met]) => !met).map(([id]) => id)
  const crew = state.crew.map(person => ({
    ...person,
    health: Math.max(0, person.health - missing.length * 8),
    role: null,
  }))
  const battery = Math.min(capacity, available)
  const day = { sol, storm, generation: generation + maintenanceBoost, used, battery, capacity, cropPower, systems,
    needs, produced, missing, supplies: { ...supplies } }
  return {
    ...state, sol, crew, placed, supplies, battery, startupEnergy: 0, wastewater,
    timeline: [...state.timeline, day],
  }
}

export function colonyReport(state) {
  const crew = state.crew.map(({ id, health }) => ({ id, health, alive: health > 0 }))
  const allAlive = crew.every(person => person.alive)
  const terminal = state.sol >= missionLength || crew.every(person => !person.alive)
  const lastThreeSols = state.timeline.slice(-3).map(({ sol, needs }) => ({ sol, needs: { ...needs } }))
  const reasons = []
  if (!allAlive) reasons.push("Üç astronotun tamamı hayatta kalmadı.")
  for (const { sol, needs } of lastThreeSols) {
    for (const [key, met] of Object.entries(needs)) {
      if (!met) reasons.push("Sol " + sol + " · " + (labels[key] ?? "Enerjili yaşam modülü") + " ihtiyacı karşılanmadı.")
    }
  }
  if (terminal && state.sol < missionLength) reasons.push("10 sol tamamlanamadı.")
  return {
    status: terminal ? (reasons.length ? "failed" : "success") : "in-progress",
    completedSols: state.sol, crew, lastThreeSols, reasons,
  }
}
