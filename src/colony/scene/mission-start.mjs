import { createColony, createColonyFromFlight } from '../mars-koloni.mjs'

/** Scene startup policy. Stored/imported flight stock always wins over a cargo preview. */
export function createSceneColony(landing, plan) {
  if (landing.source === 'flight') return createColonyFromFlight(landing)
  if (!plan) return createColony(landing)
  if (!plan.withinLimit) throw new RangeError('İniş yükü kütle sınırını aşıyor.')
  return {
    ...createColonyFromFlight(plan.landing),
    operations: { ...plan.operations },
    wastewater: 0,
  }
}
