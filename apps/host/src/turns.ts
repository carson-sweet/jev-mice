// Per-turn telemetry, read back out of what a run stored. Every engine event is
// already in the chunks and every turn's counts are in the summary segments, so
// this assembles a window of turns rather than recording anything new.
//
// Plain movement is left out. It is most of the stream by count and none of the
// story, and a turn view that includes it cannot be read.

import { readFileSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { narrate, NOT_WORTH_SAYING, type SimEvent } from '@jev-mice/engine'
import type {
  ChunkBody, SummaryBody, SummaryPoint, Turn, TurnEvent, TurnStats, TurnWindow,
} from '@jev-mice/sim'

export type { Turn, TurnEvent, TurnStats, TurnWindow } from '@jev-mice/sim'

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

/**
 * Reads as a sentence. The engine's own narrator does the phrasing, so the turn
 * history and the live log cannot describe the same event differently, as they
 * had already started to.
 */
export function describe(e: SimEvent): TurnEvent {
  const said = narrate(e)
  return said.subject === undefined
    ? { kind: said.kind, text: said.text }
    : { kind: said.kind, text: said.text, subject: said.subject }
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
      if (e.tick < first || e.tick > last || NOT_WORTH_SAYING.has(e.kind)) continue
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
