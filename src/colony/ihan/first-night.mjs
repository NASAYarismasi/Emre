import { AIR_DEFAULTS, createAirState, stepAir } from "./hava.mjs"
import { WATER_DEFAULTS, createWaterState, stepWater } from "./su.mjs"

export function readLanding(data) {
  const { crew, supplies, surfaceEnergy } = data ?? {}
  const nonnegative = value => Number.isFinite(value) && value >= 0
  if (!Array.isArray(crew) || crew.length < 1 || crew.length > 4
      || !crew.every(member => member && typeof member.id === "string")
      || ![surfaceEnergy, supplies?.water, supplies?.oxygen].every(nonnegative)) {
    throw new Error("İniş JSON dosyasında ekip, su, oksijen ve yüzey enerjisi alanlarını kontrol et.")
  }
  return { crew:crew.length, water:supplies.water, oxygen:supplies.oxygen, energy:surfaceEnergy }
}

export function previewNight(landing, policy, sunlight=.2) {
  const hours = 12.33
  const solar = 420 * sunlight
  const daylightUse = 60
  const airConfig = {...AIR_DEFAULTS,crew:landing.crew}
  const waterConfig = {...WATER_DEFAULTS,crew:landing.crew}
  let air = {...createAirState(), oxygenKg:Math.min(airConfig.tankCapacityKg,landing.oxygen)}
  let water = {...createWaterState(), cleanL:Math.min(waterConfig.tankCapacityL,landing.water)}
  const dayAvailable = solar + landing.energy
  const dayShortfall = Math.max(0, daylightUse-dayAvailable)
  let battery = Math.min(180, Math.max(0,dayAvailable-daylightUse))
  const atDusk = battery
  let unservedBase = 0
  for (let elapsed=0; elapsed<hours; elapsed++) {
    const dt=Math.min(1,hours-elapsed)
    const base=Math.min(1,battery/dt)
    battery-=base*dt
    unservedBase+=(1-base)*dt
    const available=Math.max(0,battery/dt)
    const ventilation=airConfig.fanPowerKW+airConfig.scrubberPowerKW
    const airFull=ventilation+airConfig.productionPowerKW
    const extraction=waterConfig.extractionKW+waterConfig.recoveryKW
    const waterFirst=policy==="water" && available>=ventilation+extraction
    const airKW=Math.min(available,waterFirst?ventilation:airFull)
    const waterKW=Math.min(waterFirst?extraction:waterConfig.recoveryKW,available-airKW)
    air=stepAir(air,dt,{powerKW:airKW},airConfig)
    water=stepWater(water,dt,{powerKW:waterKW,extract:waterFirst},waterConfig)
    battery=Math.max(0,battery-(air.powerUsedKW+water.powerUsedKW)*dt)
  }
  return { battery, air, water, solar, atDusk, dayShortfall, unservedBase }
}

export function connectFirstNight(airSystem, waterSystem, sample) {
  const panel=document.getElementById("first-night")
  if (!panel) return
  const form=panel.querySelector("form")
  const file=panel.querySelector("input[type=file]")
  const status=panel.querySelector("[role=status]")
  const report=panel.querySelector("output")
  const fmt=new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2})
  let landing=readLanding(sample)
  let loadId=0
  const showLanding=label=>{
    status.textContent=label+" · "+landing.crew+" kişi · "+fmt.format(landing.energy)+" kWh başlangıç · "+
      fmt.format(landing.water)+" L su · "+fmt.format(landing.oxygen)+" kg O₂ kargo"
    report.textContent=""
    airSystem.update(createAirState())
    waterSystem.update(createWaterState())
  }
  showLanding("Emre’nin örnek inişi")
  file.addEventListener("change",async()=>{
    const id=++loadId
    if (!file.files.length) return
    try {
      const next=readLanding(JSON.parse(await file.files[0].text()))
      if (id!==loadId) return
      landing=next
      showLanding(file.files[0].name)
    } catch {
      if (id!==loadId) return
      status.textContent="İniş dosyası okunamadı. Ekrandaki senaryo son geçerli inişi kullanıyor."
    }
  })
  panel.querySelector("#night-example").addEventListener("click",()=>{
    ++loadId
    file.value=""
    landing=readLanding(sample)
    showLanding("Emre’nin örnek inişi")
  })
  form.addEventListener("submit",event=>{
    event.preventDefault()
    const options=new FormData(form)
    const result=previewNight(landing,options.get("priority"),Number(options.get("sunlight")))
    const {air,water}=result
    airSystem.update({...air,producer:air.generatedKg>0})
    waterSystem.update({...water,extractor:water.extractedL>0})
    const rows=[
      ["Güneş üretimi",result.solar,"kWh/sol"],
      ["Gün batımında batarya",result.atDusk,"kWh"],
      ["Sabah batarya",result.battery,"kWh"],
      ["Temiz su deposu",water.cleanL,"L"],
      ["Oksijen deposu",air.oxygenKg,"kg"],
      ["Kabin CO₂ kütlesi",air.co2Kg,"kg"],
      ["Buzdan çıkarılan su",water.extractedL,"L"],
      ["Üretilen oksijen",air.generatedKg,"kg"],
      ["Karşılanamayan enerji",result.dayShortfall+result.unservedBase,"kWh"],
      ["Karşılanamayan oksijen",air.unservedOxygenKg,"kg"],
      ["Karşılanamayan su",water.unservedL,"L"]
    ]
    const list=document.createElement("dl")
    for(const [label,value,unit] of rows) {
      const term=document.createElement("dt")
      term.textContent=label
      const metric=document.createElement("dd")
      metric.textContent=fmt.format(value)+" "+unit
      list.append(term,metric)
    }
    report.replaceChildren(list)
  })
}
