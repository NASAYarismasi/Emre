// İhan (NASAYarismasi/-lhan 96b5438): three-sol power mission on the shared microgrid model.
import {powerForecast, LED_KW} from "./mars-power.mjs"
function runPowerMission(tables,packs,greenhouse,dayDrill) {
  let initial=8
  return [1,.2,.2].map((sun,index)=>{
    const result=powerForecast(sun,true,{tables,capacity:packs*45,initial,dayDrill,ledKW:greenhouse?LED_KW:0})
    initial=result.dawn
    return {sol:index+1,produced:result.energy,charged:result.charged,dusk:result.dusk,
      stored:result.dawn,gap:result.dayGap+result.lifeGap,greenhouseHours:result.lit}
  })
}
const panel=document.getElementById("power-mission")
if(panel) {
  const form=panel.querySelector("form")
  const report=panel.querySelector("output")
  const format=new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1})
  form.addEventListener("input",()=>{report.textContent=""})
  form.addEventListener("submit",event=>{
    event.preventDefault()
    const values=new FormData(form)
    const tables=Number(values.get("tables")), packs=Number(values.get("packs"))
    if(!Number.isInteger(tables)||tables<1||tables>42||!Number.isInteger(packs)||packs<1||packs>8)return
    const rows=runPowerMission(tables,packs,values.has("lights"),values.has("drill"))
    const reliable=rows.every(row=>row.gap<.001)
    const reserve=rows.at(-1).stored>=10
    const summary=document.createElement("p")
    summary.textContent=reliable&&reserve?"Görev başarılı. Yaşam desteği üç sol boyunca çalıştı ve son sabah en az 10 kWh kaldı.":
      "Görev eksik. "+(!reliable?"Yaşam desteği bazı saatlerde yeterli enerji alamadı. ":"")+(!reserve?"Son sabah rezervi 10 kWh’nin altında.":"")
    const table=document.createElement("table")
    const head=table.createTHead().insertRow()
    for(const label of ["Sol","Üretim","Bataryaya eklenen","Gece başlangıcı","Gece sonu","Karşılanamayan yük","Sera ışığı"]) {
      const th=document.createElement("th")
      th.scope="col"
      th.textContent=label
      head.append(th)
    }
    const body=table.createTBody()
    for(const row of rows) {
      const tr=body.insertRow()
      for(const [number,unit] of [[row.sol,""],[row.produced," kWh"],[row.charged," kWh"],[row.dusk," kWh"],[row.stored," kWh"],[row.gap," kWh"],[row.greenhouseHours," saat"]]) {
        tr.insertCell().textContent=format.format(number)+unit
      }
    }
    const scroll=document.createElement("div")
    scroll.className="power-table"
    scroll.append(table)
    report.replaceChildren(summary,scroll)
  })
  panel.querySelector("#power-farm").addEventListener("click",()=>{
    // Host: our camera views use data-ova-view and the 3D view is already full-screen.
    document.querySelector('[data-ova-view="solar"]')?.click()
  })
}
