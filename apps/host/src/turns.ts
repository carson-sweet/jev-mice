// Per-turn telemetry, read back out of what a run stored. Every engine event is
// already in the chunks and every turn's counts are in the summary segments, so
// this assembles a window of turns rather than recording anything new.
//
// Plain movement is left out. It is most of the stream by count and none of the
// story, and a turn view that includes it cannot be read.

import { readFileSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { SimEvent } from '@jev-mice/engine'
import type { ChunkBody, SummaryBody, SummaryPoint } from '@jev-mice/sim'

/** Anything that changes a life or a count. Movement and the tick marker do not. */
const SKIP = new Set(['moved', 'tick_advanced', 'decision_requested', 'run_started',
                      'run_resumed', 'mouse_spawned'])

export interface TurnStats { mice: number; cats: number; food: number; traps: number }

export interface TurnEvent {
  kind: string
  /** A sentence, so a reader does not have to know the event shapes. */
  text: string
  subject?: string
}

export interface Turn {
  tick: number
  stats: TurnStats
  delta: TurnStats
  events: TurnEvent[]
}

export interface TurnWindow {
  runId: string
  from: number
  to: number
  totalTurns: number
  turns: Turn[]
}

/** The most turns one request will assemble. A page asks for a screenful. */
export const MAX_WINDOW = 500

const zeroStats: TurnStats = { mice: 0, cats: 0, food: 0, traps: 0 }
const statsOf = (p: SummaryPoint): TurnStats =>
  ({ mice: p.population, cats: p.cats, food: p.food, traps: p.traps })
const minus = (a: TurnStats, b: TurnStats): TurnStats => ({
  mice: a.mice - b.mice, cats: a.cats - b.cats,
  food: a.food - b.food, traps: a.traps - b.traps,
})

const read = <T>(path: string): T | null => {
  if (!existsSync(path)) return null
  return JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as T
}

/** Reads as a sentence. The same phrasing the live log uses, for the same reason. */
export function describe(e: SimEvent): TurnEvent {
  const any = e as unknown as Record<string, unknown>
  const s = (k: string): string => String(any[k] ?? '')
  const subject = typeof any.id === 'string' ? any.id
    : typeof any.mouseId === 'string' ? any.mouseId
    : typeof any.motherId === 'string' ? any.motherId
    : typeof any.a === 'string' ? any.a : undefined
  const with_ = (text: string): TurnEvent =>
    subject === undefined ? { kind: e.kind, text } : { kind: e.kind, text, subject }

  switch (e.kind) {
    case 'spotted':
      return with_(`${e.id} spotted ${e.what} ${e.targetId}, ${String(e.distance)} away.`)
    case 'hunger_changed':
      return with_(`${e.id} went from ${e.from} to ${e.to}.`)
    case 'food_eaten':
      return with_(`${e.id} ate ${e.foodId}.`)
    case 'food_respawned':
      return { kind: e.kind, text: `${e.foodId} grew back at ${String(e.at.x)}, ${String(e.at.y)}.` }
    case 'trap_entered':
      return with_(`${e.id} walked into ${e.trapId}.`)
    case 'evasion_rolled':
      return with_(`${e.id} ${e.evaded ? 'slipped out of' : 'was held by'} ${e.trapId} `
        + `on a ${String(Math.round(e.chance * 100))} percent chance.`)
    case 'mouse_trapped':
      return with_(`${e.id} died in ${e.trapId}.`)
    case 'trap_respawned':
      return { kind: e.kind, text: `${e.trapId} was reset at ${String(e.at.x)}, ${String(e.at.y)}.` }
    case 'capture':
      return with_(`${e.mouseId} was caught by ${e.catId}.`)
    case 'cat_eating_started':
      return with_(`${e.id} started eating.`)
    case 'cat_eating_ended':
      return with_(`${e.id} finished eating.`)
    case 'cat_fed':
      return with_(`${e.id} was fed ${String(e.restored)}, now at ${String(e.nutrition)} percent.`)
    case 'cat_died':
      return with_(`${e.id} starved, with nothing left to catch.`)
    case 'cat_targeted':
      return with_(`${e.id} ${e.target === null ? 'gave up its target' : `is after ${e.target}`}, `
        + `now ${e.mode}.`)
    case 'cat_pounced':
      return with_(`${e.id} pounced at ${e.target}.`)
    case 'death':
      return with_(`${e.id} died of ${e.cause === 'starvation' ? 'hunger' : e.cause}.`)
    case 'birth':
      return with_(`${e.pupId} was born to ${e.motherId}, ${e.personality} and ${e.sex}.`)
    case 'brood_born':
      return with_(`${e.motherId} delivered ${String(e.pups.length)} in ${e.holeId}.`)
    case 'cap_limited_birth':
      return with_(`${String(e.lost)} of ${e.motherId}'s litter had nowhere to go.`)
    case 'mating':
      return with_(`${e.a} and ${e.b} mated in ${e.holeId}.`)
    case 'gestation_started':
      return with_(`${e.id} is carrying a litter.`)
    case 'hole_entered':
      return with_(`${e.id} went into ${e.holeId} as ${e.as}.`)
    case 'hole_left':
      return with_(`${e.id} came out of ${e.holeId}.`)
    case 'hole_freed':
      return { kind: e.kind, text: `${e.holeId} is free again.` }
    case 'memory_added':
      return with_(`${e.id} remembers: ${e.sentence}`)
    case 'alarm_exchanged':
      return { kind: e.kind, subject: e.from,
               text: `${e.from} warned ${e.to}: ${e.sentence}` }
    case 'decision_returned':
      return { kind: e.kind,
               text: `${String(e.subjects.length)} decided by `
                 + `${e.source === 'jev' ? 'Jev' : 'the rules'}: `
                 + e.subjects.map((x) => `${x.agentId} ${x.intent}`).join(', ') + '.' }
    case 'decision_fallback':
      return { kind: e.kind, text: `A batch fell back to the rules: ${e.reason}.` }
    case 'run_ended':
      return {
        kind: e.kind,
        text: e.reason === 'extinct'
          ? `Total extinction at turn ${String(e.finalTick)}: nothing left alive.`
          : `The run ended, ${e.reason}, at turn ${String(e.finalTick)}.`,
      }
    default:
      return { kind: e.kind, text: `${e.kind}${subject === undefined ? '' : ` (${subject})`}`,
               ...(subject === undefined ? {} : { subject }) }
  }
}

export interface StoredRun {
  chunks: { seq: number; firstTick: number; lastTick: number }[]
  chunkPath(seq: number): string
  summaryPath(seq: number): string
  totalTurns: number
}

export function turnWindow(run: StoredRun, from: number, to: number): TurnWindow {
  const first = Math.max(1, Math.floor(from))
  const last = Math.min(run.totalTurns, Math.floor(to))

  // One turn before the window, so the first row still has a change to show.
  const need = run.chunks.filter((c) => c.lastTick >= first - 1 && c.firstTick <= last)
  const points = new Map<number, SummaryPoint>()
  const events = new Map<number, SimEvent[]>()

  for (const c of need) {
    const summary = read<SummaryBody>(run.summaryPath(c.seq))
    for (const p of summary?.points ?? []) {
      if (p.tick >= first - 1 && p.tick <= last) points.set(p.tick, p)
    }
    const chunk = read<ChunkBody>(run.chunkPath(c.seq))
    for (const e of chunk?.events ?? []) {
      if (e.tick < first || e.tick > last || SKIP.has(e.kind)) continue
      const bucket = events.get(e.tick)
      if (bucket) bucket.push(e)
      else events.set(e.tick, [e])
    }
  }

  const turns: Turn[] = []
  for (let tick = first; tick <= last; tick++) {
    const stats = points.has(tick) ? statsOf(points.get(tick) as SummaryPoint) : zeroStats
    const before = points.has(tick - 1)
      ? statsOf(points.get(tick - 1) as SummaryPoint)
      : stats
    turns.push({
      tick,
      stats,
      delta: minus(stats, before),
      events: (events.get(tick) ?? []).map(describe),
    })
  }

  return { runId: '', from: first, to: last, totalTurns: run.totalTurns, turns }
}
