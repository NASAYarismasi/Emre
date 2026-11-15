// Illustrative sizing inputs. Hardware masses and loop efficiencies are scenario values.
export const rates = { water: 3.52, oxygen: .84, food: .8 }
export const transitDays = 259
const oxygenReserveDays = 2
const solDays = 1.0275
export const cargoOptions = {
  waterRecycler: { name: "Atık su arıtma ünitesi", kg: 280, description: "Buhar yoğuşması ve sıvı atıktan su geri kazanır." },
  oxygenUnit: { name: "Su elektrolizi ünitesi", kg: 160, description: "Elektrik ve su kullanarak oksijen üretir." },
  greenhouse: { name: "Kapalı sera", kg: 330, description: "Işık ve iklim kontrolü sağlar. Mahsul ayrıca ekilir." },
  backupPower: { name: "Yedek güneş paneli", kg: 115, description: "Fırtınada da üretir. Toz, üretimi düşürür." },
  backupBattery: { name: "Ek batarya", kg: 95, description: "Güneş üretimi düştüğünde enerji açığını kapatır." },
}
export const defaultManifest = {
  mealDays: 14, waterDays: 8, oxygenDays: 8, spareParts: 2, driedMealShare: .5,
  equipment: Object.keys(cargoOptions),
}
const baseHardware = [
  { name: "Basınçlı yaşam modülü, hava kilidi ve kabin kontrolü", kg: 1800, module: "habitat" },
  { name: "CO₂ tutucu, filtreler ve kabin havalandırması", kg: 155, module: "airScrubber" },
  { name: "Güneş paneli", kg: 115, module: "solarPanel" },
  { name: "Batarya", kg: 95, module: "battery" },
  { name: "Su ve oksijen tankları, yemek ısıtıcısı ve dağıtıcı", kg: 160 },
  { name: "Uzay giysileri, hava kilidi servis takımı ve kişisel ekipman", kg: 320 },
  { name: "Tıbbi çanta, iletişim ve onarım araçları", kg: 105 },
]
export const cargoLimitKg = 4000

export function planMission(manifest) {
  const { mealDays, waterDays, oxygenDays, spareParts, driedMealShare, equipment } = manifest
  if (![mealDays, waterDays, oxygenDays, spareParts].every(Number.isInteger) ||
      mealDays < 2 || mealDays > 20 || waterDays < 2 || waterDays > 20 ||
      oxygenDays < 2 || oxygenDays > 20 || spareParts < 0 || spareParts > 6 ||
      ![0, .5, 1].includes(driedMealShare) || !Array.isArray(equipment) ||
      new Set(equipment).size !== equipment.length || !equipment.every(id => Object.hasOwn(cargoOptions, id))) {
    throw new RangeError("Erzak ve donanım seçimlerini kontrol et.")
  }

  const crew = [1, 2, 3].map(index => ({ id: "astronaut-" + index, health: 100 }))
  const transitPersonDays = transitDays * crew.length
  const transitOxygenKg = transitPersonDays * rates.oxygen
  const transit = {
    // Regenerative flight hardware is on the transfer vehicle.
    foodKg: transitPersonDays * rates.food,
    waterKg: transitPersonDays * rates.water * .15 + transitOxygenKg * (9 / 8),
    oxygenReserveKg: oxygenReserveDays * crew.length * rates.oxygen,
  }
  const cargo = [
    ...baseHardware,
    ...equipment.map(id => ({ ...cargoOptions[id], module: ({ backupPower: "solarPanel", backupBattery: "battery" })[id] ?? id })),
    { name: "Paketli öğünler", kg: mealDays * crew.length * solDays * (.95 - .3 * driedMealShare) },
    { name: "İçme ve hazırlama suyu", kg: waterDays * crew.length * solDays * rates.water },
    { name: "Depolanmış oksijen", kg: oxygenDays * crew.length * solDays * rates.oxygen },
    { name: "Yedek parçalar", kg: spareParts * 16 },
  ]
  const massKg = cargo.reduce((total, item) => total + item.kg, 0)
  return {
    transit, cargo, massKg, withinLimit: massKg <= cargoLimitKg,
    landing: {
      crew,
      supplies: { food: mealDays, water: waterDays, oxygen: oxygenDays, spareParts },
      modules: cargo.flatMap(item => item.module ? [item.module] : []),
      landingSite: "flat", surfaceEnergy: 10,
    },
    operations: { driedMealShare },
  }
}
