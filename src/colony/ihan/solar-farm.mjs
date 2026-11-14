import { batchStaticLeaves } from "../scene/static-model.mjs"
import { addPowerCables } from "./power-cables.mjs"
import { powerForecast, DAYLIGHT_HOURS, DRILL_HOURS } from "./mars-power.mjs"
export function addSolarFarm(T, scene, terrainHeight, obstacles, destinations) {
  // Adapted from Samet's solar preview in 0e3352a87baebff83558045dcb539462d3ecf4f7.
  const farm = new T.Group()
  farm.name = "MarsSolarFarm"
  const x0 = -57, z0 = 46
  const level = terrainHeight(x0, z0)
  farm.position.set(x0, level, z0)
  scene.add(farm)
  const cells = document.createElement("canvas")
  cells.width = 500
  cells.height = 400
  const ctx = cells.getContext("2d")
  ctx.fillStyle = "#8a8981"
  ctx.fillRect(0, 0, 500, 400)
  for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) {
    const x = col * 100, y = row * 200
    ctx.fillStyle = (row + col) % 2 ? "#172b47" : "#1f3452"
    ctx.fillRect(x + 3, y + 3, 94, 194)
    ctx.fillStyle = "#4a607a"
    for (let line = 1; line < 16; line++) ctx.fillRect(x + 5, y + line * 12, 90, 1)
    ctx.fillRect(x + 49, y + 4, 1, 192)
  }
  const texture = new T.CanvasTexture(cells)
  texture.colorSpace = T.SRGBColorSpace
  texture.anisotropy = 8
  const frame = new T.MeshStandardMaterial({color:0x686b66, metalness:.58, roughness:.48})
  const panel = new T.MeshStandardMaterial({map:texture, metalness:.26, roughness:.34})
  const part = (parent, geometry, material, x, y, z) => {
    const mesh = new T.Mesh(geometry, material)
    mesh.position.set(x,y,z)
    mesh.receiveShadow = mesh.castShadow = true
    parent.add(mesh)
    return mesh
  }
  const back = new T.BoxGeometry(5,.09,4)
  const face = new T.PlaneGeometry(5,4).rotateX(-Math.PI/2)
  const column = new T.BoxGeometry(.13,1,.13)
  const footing = new T.BoxGeometry(.44,.14,.44)
  const tables=[]
  for (let row = 0; row < 6; row++) for (let col = 0; col < 7; col++) {
    const x = (col - 3) * 6, z = (row - 2.5) * 8
    const y = terrainHeight(x0 + x, z0 + z) - level
    const table = new T.Group()
    tables.push({x,y,z})
    table.position.set(x,y+2.25,z)
    table.rotation.x = .55
    farm.add(table)
    part(table,back,frame,0,0,0)
    part(table,face,panel,0,.052,0)
    for (const dx of [-1.9,1.9]) for (const dz of [-1.4,1.4]) {
      const groundZ = z + dz * Math.cos(table.rotation.x)
      const ground = terrainHeight(x0+x+dx,z0+groundZ)-level
      const top = y + 2.2 - dz * Math.sin(table.rotation.x)
      const height = Math.max(.1,top-ground)
      part(farm,column,frame,x+dx,ground+height/2,groundZ).scale.y = height
      part(farm,footing,frame,x+dx,ground+.035,groundZ)
    }
    obstacles.push(new T.Box3(
      new T.Vector3(x0+x-2.68,level+y,z0+z-1.93),
      new T.Vector3(x0+x+2.68,level+y+3.4,z0+z+1.93)))
  }
  const cabinet=new T.BoxGeometry(2.8,2.3,1.6)
  const enclosure=new T.MeshStandardMaterial({color:0xa4aa9e,metalness:.42,roughness:.66})
  const terminal=new T.MeshStandardMaterial({color:0x252d32,roughness:.76})
  const hazard=new T.MeshStandardMaterial({color:0xd0a14a,roughness:.71})
  const display=document.createElement("canvas")
  display.width=512
  display.height=256
  const screen=display.getContext("2d")
  const displayTexture=new T.CanvasTexture(display)
  displayTexture.colorSpace=T.SRGBColorSpace
  const displayMaterial=new T.MeshBasicMaterial({map:displayTexture})
  const inverters=[]
  for(let i=0;i<10;i++) {
    const x=23+4*Math.floor(i/5),z=(i%5-2)*4.5
    const ground=terrainHeight(x0+x,z0+z)
    const rack=new T.Group()
    inverters.push({x,y:ground-level,z})
    rack.position.set(x,ground-level,z)
    farm.add(rack)
    part(rack,cabinet,enclosure,0,1.34,0)
    part(rack,new T.BoxGeometry(2.9,.19,1.71),terminal,0,.17,0)
    part(rack,new T.BoxGeometry(2.72,2.12,.06),terminal,0,1.34,.81)
    for(const side of [-.68,.68]) {
      part(rack,new T.BoxGeometry(1.29,2.05,.07),enclosure,side,1.34,.856)
      part(rack,new T.BoxGeometry(.06,.32,.07),terminal,side*.28,1.25,.91)
      for(let slot=0;slot<6;slot++) part(rack,new T.BoxGeometry(.85,.035,.025),terminal,side,.50+slot*.083,.903)
    }
    part(rack,new T.BoxGeometry(.18,.14,.04),hazard,-.88,1.76,.91)
    const monitor=part(rack,new T.PlaneGeometry(.91,.455),displayMaterial,.67,1.91,.908)
    monitor.castShadow=false
    part(rack,new T.BoxGeometry(1.05,1.25,.56),terminal,-.63,.68,1.51)
    part(rack,new T.BoxGeometry(.94,1.13,.06),enclosure,-.63,.68,1.82)
    part(rack,new T.BoxGeometry(.64,.075,.035),hazard,-.63,1.1,1.86)
    for(let vent=0;vent<6;vent++) part(rack,new T.BoxGeometry(.68,.04,.035),terminal,-.63,.45+vent*.07,1.86)
    const label=document.createElement("canvas")
    label.width=256; label.height=80
    const ctx=label.getContext("2d")
    ctx.fillStyle="#263033";ctx.fillRect(0,0,256,80)
    ctx.fillStyle="#ddf1ed";ctx.font="bold 30px monospace";ctx.fillText((i+1)+" / DC > AC",18,35)
    ctx.font="23px monospace";ctx.fillText(i<2?"42 / DOĞRUDAN":"42 / BATARYA",25,66)
    const texture=new T.CanvasTexture(label)
    texture.colorSpace=T.SRGBColorSpace
    part(rack,new T.PlaneGeometry(.68,.21),new T.MeshBasicMaterial({map:texture}),-.63,.93,1.87)
    rack.updateWorldMatrix(true,true)
    obstacles.push(new T.Box3().setFromObject(rack).expandByScalar(.12))
  }
  const wiring=destinations ? addPowerCables(T,farm,
    (x,z)=>terrainHeight(x0+x,z0+z)-level,
    Object.fromEntries(Object.entries(destinations).map(([key,site])=>[key,{x:site.x-x0,z:site.z-z0}])),
    tables,inverters) : null
  const lifecycle=new AbortController()
  const weatherButtons=document.querySelectorAll("[data-solar-weather]")
  const moment=document.getElementById("battery-moment")
  const fmt=new Intl.NumberFormat("tr-TR",{maximumFractionDigits:1})
  let transmission=1
  let closed=true
  const breaker=document.getElementById("main-breaker")
  function toggleBreaker() {
    closed=!closed
    update()
    document.dispatchEvent(new CustomEvent("mars-breaker",{detail:closed}))
  }
  breaker?.addEventListener("click",toggleBreaker,{signal:lifecycle.signal})
  function update(live) {
    const result=live?.forecast ?? powerForecast(transmission,closed)
    wiring?.setClosed(closed)
    if(breaker) {
      breaker.setAttribute("aria-pressed",String(closed))
      breaker.textContent=closed?"Ana şalteri indir":"Ana şalteri kaldır"
    }
    const status=document.getElementById("breaker-status")
    if(status) status.textContent=closed?"Sera ve sondaj hattı bağlı":"Sera ve sondaj hattı kesildi"
    const stored=live?.batteryKWh ?? (moment?.value==="dawn"?result.dawn:result.dusk)
    const soc=stored/180
    screen.fillStyle="#101b22";screen.fillRect(0,0,512,256)
    screen.fillStyle="#d6f0ed";screen.font="32px monospace";screen.fillText("BATARYA / ENERJI",24,46)
    screen.font="54px monospace";screen.fillText(fmt.format(stored)+" kWh",24,114)
    screen.font="35px monospace";screen.fillText(Math.round(soc*100)+" %",24,171)
    screen.fillStyle="#31464e";screen.fillRect(24,194,464,32)
    screen.fillStyle="#6bd5ad";screen.fillRect(24,194,464*soc,32)
    displayTexture.needsUpdate=true
    const metrics={
      "solar-generated":fmt.format(result.energy)+" kWh/sol",
      "solar-balance":fmt.format(result.energy-413)+" kWh/sol",
      "solar-life-gap":fmt.format(result.lifeGap)+" kWh",
      "solar-average":fmt.format(result.average)+" kW",
      "solar-direct":fmt.format(result.direct)+" kWh",
      "solar-backup":fmt.format(result.backup)+" kWh",
      "solar-charged":fmt.format(result.charged)+" kWh",
      "solar-day-led":fmt.format(result.dayLed)+" saat",
      "solar-day-gap":fmt.format(result.dayGap)+" kWh",
      "solar-drill":fmt.format(result.drilling)+" saat · "+fmt.format(result.waterLiters)+" / 100 L",
      "solar-led":fmt.format(result.lit)+" / 12,33 saat · %"+fmt.format(result.lit/DAYLIGHT_HOURS*100),
      "solar-storage":fmt.format(stored)+" / 180 kWh · %"+fmt.format(soc*100)
    }
    for(const [id,value] of Object.entries(metrics)) {
      const target=document.getElementById(id)
      if(target) target.textContent=value
    }
    for(const button of weatherButtons) button.setAttribute("aria-pressed",String(Number(button.dataset.solarWeather)===transmission))
  }
  for(const button of weatherButtons) button.addEventListener("click",()=>{
    transmission=Number(button.dataset.solarWeather)
    update()
  },{signal:lifecycle.signal})
  moment?.addEventListener("change",update,{signal:lifecycle.signal})
  update()
  // Host lifecycle: batching detaches source leaves, so retain their resources for teardown.
  const resources=new Set()
  const remember=()=>farm.traverse(o=>{
    if(o.geometry) resources.add(o.geometry)
    for(const material of [o.material].flat()) if(material) {
      resources.add(material)
      for(const value of Object.values(material)) if(value?.isTexture) resources.add(value)
    }
  })
  remember()
  // Host perf: preserve table instancing; cable/cabinet leaves batch by material, live lever excluded.
  instanceByGeometry(T, farm, wiring?.lever)
  batchStaticLeaves(farm, new Set(wiring ? [wiring.lever] : []))
  remember()
  return {dispose(){lifecycle.abort();for(const resource of resources)resource.dispose();resources.clear()}, farm, level, x0, z0, toggleBreaker,
    setPower(state) { transmission=state.transmission; closed=state.switches.main; update(state) }, switchPosition:wiring && farm.localToWorld(wiring.switchPosition.clone())}
}

// Host optimisation (Emre/Claude): the farm is static, so the ~390 meshes above (42 tables × back,
// face, 4 columns, 4 footings + 10 cabinets) collapse into one InstancedMesh per geometry/material
// pair — same geometry and placement, ~5 draw calls instead of ~390.
function instanceByGeometry(T, root, live) {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const groups = new Map()
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh === live) return
    const key = mesh.geometry.uuid + "|" + mesh.material.uuid
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(mesh)
  })
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue
    const [first] = meshes
    const batch = new T.InstancedMesh(first.geometry, first.material, meshes.length)
    meshes.forEach((mesh, i) => batch.setMatrixAt(i, inverse.clone().multiply(mesh.matrixWorld)))
    batch.castShadow = batch.receiveShadow = true
    batch.computeBoundingSphere()
    for (const mesh of meshes) mesh.removeFromParent()
    root.add(batch)
  }
  for (const child of [...root.children]) if (child.isGroup && !child.children.length) root.remove(child)
}
