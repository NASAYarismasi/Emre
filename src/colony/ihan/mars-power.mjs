/** IHAN-SRC: ed79956 physical forecast; pure, no DOM/Three.js.
 * GAME ASSUMPTION: tray dimensions/count, PPFD 350, efficacy 2.5 umol/J, optical
 * efficiency .8, algae .18 kW, 12.33 h light, 180 kWh storage, .9 charge efficiency,
 * 20/80 inverter split, 60 kWh daytime habitat and 6 kW night habitat.
 * GAME ASSUMPTION: 42 tables of 20 m2, solar yield 2.5 kWh/m2/sol, panel
 * efficiency .25 and .8 system factor; drill 2 kW and tank 100 L.
 * GAME ASSUMPTION: regolith heat capacity .8, ice 2.05 kJ/kg/K, 43 K heating,
 * 10% ice, 80% capture, 65% process efficiency and .15 kWh/L auxiliaries.
 * Sublimation latent heat 2834 kJ/kg (triple-point approximation):
 * https://www.publications.usace.army.mil/Portals/76/Publications/EngineerManuals/EM_1110-2-1406.pdf
 */
export const DAYLIGHT_HOURS=12.33
// Six 1.28 x 2.37 m growing trays; algae lights are a separate auxiliary load.
export const LED_KW=6*1.28*2.37*350/(2.5*.8*1000)+.18
export const LED_KWH=LED_KW*DAYLIGHT_HOURS
export const TANK_L=100
export const ICE_FRACTION=.10
export const CAPTURE=.80
// Sealed sublimation: sensible heat to 253 K plus phase change and auxiliaries.
export const WATER_KWH_PER_L=((.9*.8+.1*2.05)*43/.1+2834)/(3600*CAPTURE*.65)+.15
export const DRILL_KW=2
export const DRILL_HOURS=TANK_L*WATER_KWH_PER_L/DRILL_KW
export function solarEnergy(tables, transmission) {
  return tables*20*2.5*.25*.8*transmission
}
export function powerForecast(transmission,closed=true, switches={}) {
  const lines=Array.from({length:10},(_,i)=>switches["inv"+(i+1)] !== false)
  const loadFraction=lines.slice(0,2).filter(Boolean).length/10
  const chargeFraction=lines.slice(2).filter(Boolean).length/10
  const batterySupport=switches.batterySupport !== false
  const energy=solarEnergy(42,transmission)
  const steps=120, dt=DAYLIGHT_HOURS/steps
  const profile=Array.from({length:steps},(_,i)=>Math.sin(Math.PI*(i+.5)/steps))
  const normalization=profile.reduce((sum,value)=>sum+value,0)
  let battery=0, direct=0, backup=0, drilling=0, dayLed=0, charged=0, dayGap=0
  for(const weight of profile) {
    const production=energy*weight/normalization
    const loadBranch=production*loadFraction
    const chargeBranch=production*chargeFraction
    const habitat=60/steps
    const availableForStorage=Math.max(0,chargeBranch-habitat)
    const missingHabitat=Math.max(0,habitat-chargeBranch)
    const habitatBackup=Math.min(battery,missingHabitat)
    battery-=habitatBackup
    dayGap+=missingHabitat-habitatBackup
    const added=Math.min(180-battery,availableForStorage*.9)
    battery+=added
    charged+=added
    if(!closed) continue
    const drillNeed=DRILL_KW*Math.min(dt,DRILL_HOURS-drilling)
    const ledNeed=LED_KW*dt
    const fromSolar=Math.min(loadBranch,drillNeed+ledNeed)
    const fromBattery=Math.min(batterySupport?battery:0,drillNeed+ledNeed-fromSolar)
    battery-=fromBattery
    direct+=fromSolar
    backup+=fromBattery
    const supply=fromSolar+fromBattery
    const drillEnergy=Math.min(drillNeed,supply)
    drilling+=drillEnergy/DRILL_KW
    dayLed+=(supply-drillEnergy)/LED_KW
  }
  const dusk=battery
  const life=6*DAYLIGHT_HOURS
  const afterLife=Math.max(0,dusk-life)
  const lit=closed&&batterySupport?Math.min(DAYLIGHT_HOURS,afterLife/LED_KW):0
  return {energy,average:energy/DAYLIGHT_HOURS,direct,backup,charged,dayLed,dayGap,drilling,
    waterLiters:drilling*DRILL_KW/WATER_KWH_PER_L,dusk,lit,lifeGap:Math.max(0,life-dusk),dawn:afterLife-lit*LED_KW}
}
