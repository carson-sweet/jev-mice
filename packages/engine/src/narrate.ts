// One place that turns an event into a sentence.
//
// The live log in the simulation process and the turn history in the host each
// had their own copy of this, and they had already drifted: a starvation read
// "m0001 starved." in one and "m0001 died of hunger." in the other. Both apps
// depend on the engine and neither depends on the other, so it belongs here,
// beside the memory sentences it resembles.

import type { SimEvent } from './types.js'

export interface Narration {
  kind: SimEvent['kind']
  /** Ready to show. No caller should rephrase it. */
  text: string
  /** The agent the line is about, where there is one. */
  subject?: string
}

/** Whether a line changes the population, which is what a live log shows. */
export const CHANGES_POPULATION: ReadonlySet<SimEvent['kind']> = new Set([
  'death', 'capture', 'mouse_trapped', 'birth', 'mating', 'cat_died',
  'cap_limited_birth',
])

/** Movement and bookkeeping, which a turn view leaves out. */
export const NOT_WORTH_SAYING: ReadonlySet<string> = new Set([
  'moved', 'tick_advanced', 'decision_requested', 'run_started', 'run_resumed',
  'mouse_spawned',
])

const at = (c: { x: number; y: number }): string => `${String(c.x)}, ${String(c.y)}`

export function narrate(e: SimEvent): Narration {
  const said = (text: string, subject?: string): Narration =>
    subject === undefined ? { kind: e.kind, text } : { kind: e.kind, text, subject }

  switch (e.kind) {
    case 'death':
      // A cat kill and a trap death are said by the events that name the cat or
      // the trap, so only starvation is said here. Saying all three would
      // report one loss twice.
      return e.cause === 'starvation'
        ? said(`${e.id} starved.`, e.id)
        : said(`${e.id} died.`, e.id)
    case 'capture':
      return said(`${e.mouseId} was caught by ${e.catId}.`, e.mouseId)
    case 'mouse_trapped':
      return said(`${e.id} died in ${e.trapId}.`, e.id)
    case 'cat_died':
      return said(`${e.id} starved, with nothing left to catch.`, e.id)
    case 'birth':
      return said(
        `${e.pupId} was born to ${e.motherId}, ${e.personality} and ${e.sex}.`, e.pupId)
    case 'brood_born':
      return said(`${e.motherId} delivered ${String(e.pups.length)} in ${e.holeId}.`,
                  e.motherId)
    case 'mating':
      return said(`${e.a} and ${e.b} mated in ${e.holeId}.`, e.a)
    case 'cap_limited_birth':
      return said(`${String(e.lost)} of ${e.motherId}'s litter had nowhere to go; `
        + 'the world is full.', e.motherId)
    case 'gestation_started':
      return said(`${e.id} is carrying a litter.`, e.id)
    case 'spotted':
      return said(`${e.id} spotted ${e.what} ${e.targetId}, ${String(e.distance)} away.`, e.id)
    case 'hunger_changed':
      return said(`${e.id} went from ${e.from} to ${e.to}.`, e.id)
    case 'food_eaten':
      return said(`${e.id} ate ${e.foodId}.`, e.id)
    case 'food_respawned':
      return said(`${e.foodId} grew back at ${at(e.at)}.`)
    case 'trap_entered':
      return said(`${e.id} walked into ${e.trapId}.`, e.id)
    case 'evasion_rolled':
      return said(`${e.id} ${e.evaded ? 'slipped out of' : 'was held by'} ${e.trapId} `
        + `on a ${String(Math.round(e.chance * 100))} percent chance.`, e.id)
    case 'trap_respawned':
      return said(`${e.trapId} was reset at ${at(e.at)}.`)
    case 'cat_eating_started':
      return said(`${e.id} started eating.`, e.id)
    case 'cat_eating_ended':
      return said(`${e.id} finished eating.`, e.id)
    case 'cat_fed':
      return said(`${e.id} was fed ${String(e.restored)}, now at `
        + `${String(e.nutrition)} percent.`, e.id)
    case 'cat_targeted':
      return said(`${e.id} ${e.target === null ? 'gave up its target' : `is after ${e.target}`}`
        + `, now ${e.mode}.`, e.id)
    case 'cat_pounced':
      return said(`${e.id} pounced at ${e.target}.`, e.id)
    case 'hole_entered':
      return said(`${e.id} went into ${e.holeId} as ${e.as}.`, e.id)
    case 'hole_left':
      return said(`${e.id} came out of ${e.holeId}.`, e.id)
    case 'hole_freed':
      return said(`${e.holeId} is free again.`)
    case 'memory_added':
      return said(`${e.id} remembers: ${e.sentence}`, e.id)
    case 'alarm_exchanged':
      return said(`${e.from} warned ${e.to}: ${e.sentence}`, e.from)
    case 'decision_returned':
      return said(`${String(e.subjects.length)} decided by `
        + `${e.source === 'jev' ? 'Jev' : 'the rules'}: `
        + e.subjects.map((x) => `${x.agentId} ${x.intent}`).join(', ') + '.')
    case 'decision_fallback':
      return said(`A batch fell back to the rules: ${e.reason}.`)
    case 'run_ended':
      return said(e.reason === 'extinct'
        ? `Total extinction at turn ${String(e.finalTick)}: nothing left alive.`
        : `The run ended, ${e.reason}, at turn ${String(e.finalTick)}.`)
    default:
      return said(e.kind)
  }
}
