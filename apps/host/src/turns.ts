// Per-turn telemetry, read back out of what a run stored. Every engine event is
// already in the chunks and every turn's counts are in the summary segments, so
// this assembles a window of turns rather than recording anything new.
//
// Plain movement is left out. It is most of the stream by count and none of the
// story, and a turn view that includes it cannot be read.

import { readFile } from 'node:fs/promises'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
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

const unzip = promisify(gunzip)

/**
 * Decoded chunks, kept briefly.
 *
 * Reading was synchronous, so decoding a 2.2MB chunk stalled every other
 * request on the single thread, and there was no cache, so paging one chunk ten
 * turns at a time decompressed the same bytes twenty-five times. Async removes
 * the stall; a handful of entries removes the repetition, since paging is
 * overwhelmingly sequential and local.
 */
const CACHE_ENTRIES = 6
const cache = new Map<string, unknown>()

const remember = (key: string, value: unknown): void => {
  cache.delete(key)
  cache.set(key, value)
  // Insertion order is iteration order, so the front is the least recent.
  while (cache.size > CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** Forget a run's decoded chunks, for a run being replaced or removed. */
export function forget(runId: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${runId}:`)) cache.delete(key)
  }
}

async function read<T>(key: string, path: string): Promise<T | null> {
  if (cache.has(key)) return cache.get(key) as T
  let raw: Buffer
  try {
    raw = await readFile(path)
  } catch {
    // A chunk that is not there yet is not an error: a run in progress has not
    // written its open chunk, and a reader may legitimately ask for it.
    return null
  }
  const parsed = JSON.parse((await unzip(raw)).toString('utf8')) as T
  remember(key, parsed)
  return parsed
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
  /** Namespaces this run's cache entries. */
  id: string
  chunks: { seq: number; firstTick: number; lastTick: number }[]
  chunkPath(seq: number): string
  summaryPath(seq: number): string
  totalTurns: number
}

export async function turnWindow(
  run: StoredRun, from: number, to: number,
): Promise<TurnWindow> {
  const first = Math.max(1, Math.floor(from))
  const last = Math.min(run.totalTurns, Math.floor(to))

  // One turn before the window, so the first row still has a change to show.
  const need = run.chunks.filter((c) => c.lastTick >= first - 1 && c.firstTick <= last)
  const points = new Map<number, SummaryPoint>()
  const events = new Map<number, SimEvent[]>()

  for (const c of need) {
    const summary = await read<SummaryBody>(
      `${run.id}:summary:${String(c.seq)}`, run.summaryPath(c.seq))
    for (const p of summary?.points ?? []) {
      if (p.tick >= first - 1 && p.tick <= last) points.set(p.tick, p)
    }
    const chunk = await read<ChunkBody>(
      `${run.id}:chunk:${String(c.seq)}`, run.chunkPath(c.seq))
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

  return { runId: run.id, from: first, to: last, totalTurns: run.totalTurns, turns }
}
