import { powerForecast, LED_KW, WATER_KWH_PER_L, ICE_FRACTION, CAPTURE } from "./mars-power.mjs"
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

export function previewNight(landing, policy, sunlight=.2, lighting="off",branchConnected=true) {
  const hours = 12.33
  const airConfig = {...AIR_DEFAULTS,crew:landing.crew}
  const waterConfig = {...WATER_DEFAULTS,crew:landing.crew,iceWaterFraction:ICE_FRACTION,captureEfficiency:CAPTURE,litersPerHour:WATER_DEFAULTS.extractionKW/WATER_KWH_PER_L}
  let air = {...createAirState(), oxygenKg:Math.min(airConfig.tankCapacityKg,landing.oxygen)}
  let water = {...createWaterState(), cleanL:Math.min(waterConfig.tankCapacityL,landing.water)}
  const lampKW=branchConnected?({full:LED_KW,dim:LED_KW*.4,off:0}[lighting]):0
  const grid=powerForecast(sunlight,branchConnected,{initial:landing.energy,ledKW:lampKW,nightDrill:policy==="water"})
  const {energy:solar,dayGap:dayShortfall,dusk:atDusk,lifeGap:unservedBase}=grid
  const greenhouse={energy:0,water:0,litHours:0}
  const daytimeWater=Math.min(waterConfig.tankCapacityL-water.cleanL,grid.drilling*waterConfig.litersPerHour)
  water.cleanL+=daytimeWater
  water.iceKg-=daytimeWater/(ICE_FRACTION*CAPTURE)
  const irrigationRate=.16
  const waterReserve=waterConfig.crew*waterConfig.waterPersonDay*hours/24
  const poweredHours=Math.max(0,hours-unservedBase/6)
  air=stepAir(air,poweredHours,{powerKW:3.5},airConfig)
  water=stepWater(water,poweredHours,{powerKW:.3,extract:false},waterConfig)
  air=stepAir(air,hours-poweredHours,{powerKW:0},airConfig)
  water=stepWater(water,hours-poweredHours,{powerKW:0,extract:false},waterConfig)
  const extracted=Math.min(grid.nightDrilling*waterConfig.litersPerHour,waterConfig.tankCapacityL-water.cleanL)
  water.cleanL+=extracted
  water.extractedL+=daytimeWater+extracted
  greenhouse.litHours=Math.min(grid.lit,Math.max(0,water.cleanL-waterReserve)/irrigationRate)
  greenhouse.water=greenhouse.litHours*irrigationRate
  greenhouse.energy=greenhouse.litHours*lampKW
  water.cleanL-=greenhouse.water
  return {battery:grid.dawn,air,water,solar,atDusk,dayShortfall,unservedBase,greenhouse}

}

export function connectFirstNight(airSystem, waterSystem, sample, greenhouseModel) {
  const panel=document.getElementById("first-night")
  if (!panel) return
  const form=panel.querySelector("form")
  const file=panel.querySelector("input[type=file]")
  const status=panel.querySelector("[role=status]")
  const report=panel.querySelector("output")
  const fmt=new Intl.NumberFormat("tr-TR",{maximumFractionDigits:2})
  let landing=readLanding(sample)
  let loadId=0
  let branchConnected=true
  document.addEventListener("mars-breaker",event=>{
    branchConnected=event.detail
    if(!branchConnected){
      greenhouseModel?.setNight(false)
      waterSystem.update(createWaterState())
    }
    report.textContent=""
  })
  const showLanding=label=>{
    status.textContent=label+" · "+landing.crew+" kişi · "+fmt.format(landing.energy)+" kWh başlangıç · "+
      fmt.format(landing.water)+" L su · "+fmt.format(landing.oxygen)+" kg O₂ kargo"
    report.textContent=""
    greenhouseModel?.setNight(false)
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
    const priority=options.get("priority"), sunlight=Number(options.get("sunlight"))
    const lighting=branchConnected ? options.get("lighting") ?? "off" : "off"
    const result=previewNight(landing,priority,sunlight,lighting,branchConnected)
    greenhouseModel?.setNight(result.greenhouse.litHours>0)
    const alternate=lighting==="full"?"dim":"full"
    const comparison=previewNight(landing,priority,sunlight,alternate,branchConnected)
    const {air,water}=result
    airSystem.update({...air,producer:air.generatedKg>0})
    waterSystem.update({...water,extractor:water.extractedL>0})
    const rows=[
      ["Güneş üretimi",result.solar,"kWh/sol"],
      ["Gün batımında batarya",result.atDusk,"kWh"],
      ["Sabah batarya",result.battery,"kWh"],
      ["Sera elektrik tüketimi",result.greenhouse.energy,"kWh"],
      ["Sera sulama tüketimi",result.greenhouse.water,"L"],
      ["Sera LED çalışma süresi",result.greenhouse.litHours,"saat"],
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
    const compare=document.createElement("p")
    const label=alternate==="dim"?"Kısık LED":"Tam LED"
    compare.textContent=label+" ile aynı koşullarda sabah "+
      fmt.format(comparison.battery)+" kWh ve "+fmt.format(comparison.water.cleanL)+
      " L su kalır. LED "+fmt.format(comparison.greenhouse.litHours)+" saat çalışır."
    report.replaceChildren(list,...(branchConnected?[compare]:[]))
  })
}
