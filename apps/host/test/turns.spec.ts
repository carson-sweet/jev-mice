// The per-turn telemetry reader, tested directly against fabricated storage.
// ISSUE-017: it had no test file, and every edge case below was reachable only
// through a sixty-second end-to-end run that never deliberately hit one.
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import {
  turnWindow, describe as describeEvent, forget, MAX_WINDOW, type StoredRun,
} from '@jev-mice/sim'

/** The stored bytes, or null if the file is not there, as the reader contract asks. */
async function readOrNull(path: string): Promise<Uint8Array | null> {
  try { return new Uint8Array(await readFile(path)) } catch { return null }
}


const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

interface Chunk { seq: number; firstTick: number; lastTick: number }

/** A run on disk, exactly as the simulation would have written it. */
function stored(o: {
  chunks: Chunk[]
  events?: Record<number, { kind: string; tick: number; [k: string]: unknown }[]>
  points?: Record<number, { mice: number; cats: number; food: number; traps: number }>
  omitChunk?: number
  omitSummary?: number
  corrupt?: number
  totalTurns?: number
}): StoredRun {
  const root = mkdtempSync(join(tmpdir(), 'jev-turns-'))
  dirs.push(root)
  mkdirSync(join(root, 'chunks'), { recursive: true })
  mkdirSync(join(root, 'summary'), { recursive: true })

  for (const c of o.chunks) {
    const events = []
    const points = []
    for (let t = c.firstTick; t <= c.lastTick; t++) {
      events.push(...(o.events?.[t] ?? []))
      const p = o.points?.[t]
      points.push({
        tick: t,
        population: p?.mice ?? 10, cats: p?.cats ?? 2,
        food: p?.food ?? 5, traps: p?.traps ?? 3,
        births: 0, deathsByStarvation: 0, deathsByTrap: 0, deathsByCat: 0,
        meanNutrition: 50, judged: 0, fallbacks: 0,
      })
    }
    if (o.omitChunk !== c.seq) {
      const body = o.corrupt === c.seq
        ? Buffer.from('not gzip at all')
        : gzipSync(JSON.stringify({ runId: 'r', seq: c.seq, firstTick: c.firstTick,
                                    lastTick: c.lastTick, events }))
      writeFileSync(join(root, 'chunks', `${String(c.seq)}.json.gz`), body)
    }
    if (o.omitSummary !== c.seq) {
      writeFileSync(join(root, 'summary', `${String(c.seq)}.json.gz`),
                    gzipSync(JSON.stringify({ runId: 'r', seq: c.seq, points })))
    }
  }

  return {
    id: root,
    chunks: o.chunks,
    readChunk: (seq: number) => readOrNull(join(root, 'chunks', `${String(seq)}.json.gz`)),
    readSummary: (seq: number) => readOrNull(join(root, 'summary', `${String(seq)}.json.gz`)),
    totalTurns: o.totalTurns ?? o.chunks[o.chunks.length - 1]?.lastTick ?? 0,
  }
}

const oneChunk: Chunk[] = [{ seq: 0, firstTick: 1, lastTick: 250 }]
const twoChunks: Chunk[] = [
  { seq: 0, firstTick: 1, lastTick: 250 },
  { seq: 1, firstTick: 251, lastTick: 500 },
]

describe('A window of turns', () => {
  it('Returns one row per turn asked for', async () => {
    const w = await turnWindow(stored({ chunks: oneChunk }), 10, 19)
    expect(w.turns.map((t) => t.tick)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
  })

  it('Spans two chunks without a gap at the seam', async () => {
    const w = await turnWindow(stored({ chunks: twoChunks }), 248, 253)
    expect(w.turns.map((t) => t.tick)).toEqual([248, 249, 250, 251, 252, 253])
    for (const t of w.turns) expect(t.stats.mice).toBe(10)
  })

  it('Takes the change from the turn before the window, not from nothing', async () => {
    const run = stored({
      chunks: oneChunk,
      points: { 9: { mice: 10, cats: 2, food: 5, traps: 3 },
                10: { mice: 8, cats: 1, food: 7, traps: 3 } },
    })
    const w = await turnWindow(run, 10, 10)
    expect(w.turns[0]?.delta).toEqual({ mice: -2, cats: -1, food: 2, traps: 0 })
  })

  it('Shows no change on the very first turn, having nothing to compare', async () => {
    const w = await turnWindow(stored({ chunks: oneChunk }), 1, 1)
    expect(w.turns[0]?.delta).toEqual({ mice: 0, cats: 0, food: 0, traps: 0 })
  })

  it('Stops at the last turn the run reached', async () => {
    const w = await turnWindow(stored({ chunks: oneChunk, totalTurns: 120 }), 115, 130)
    expect(w.turns.map((t) => t.tick)).toEqual([115, 116, 117, 118, 119, 120])
    expect(w.totalTurns).toBe(120)
  })

  it('Leaves out plain movement and the turn marker', async () => {
    const run = stored({
      chunks: oneChunk,
      events: { 5: [
        { kind: 'moved', tick: 5, id: 'm0001' },
        { kind: 'tick_advanced', tick: 5, population: 10 },
        { kind: 'food_eaten', tick: 5, id: 'm0001', foodId: 'f0001' },
      ] },
    })
    const turn = (await turnWindow(run, 5, 5)).turns[0]
    expect(turn?.events.map((e) => e.kind)).toEqual(['food_eaten'])
  })
})

describe('When the storage is not what it should be', () => {
  it('Gives a turn with no counts rather than failing, when a summary is missing', async () => {
    const run = stored({ chunks: oneChunk, omitSummary: 0 })
    const w = await turnWindow(run, 5, 6)
    expect(w.turns).toHaveLength(2)
    expect(w.turns[0]?.stats).toEqual({ mice: 0, cats: 0, food: 0, traps: 0 })
  })

  it('Gives turns with no events rather than failing, when a chunk is missing', async () => {
    const run = stored({ chunks: oneChunk, omitChunk: 0 })
    const w = await turnWindow(run, 5, 6)
    expect(w.turns).toHaveLength(2)
    expect(w.turns[0]?.events).toEqual([])
    // The counts still come through, because the summary is a separate file.
    expect(w.turns[0]?.stats.mice).toBe(10)
  })

  it('Says what went wrong when a chunk is corrupt, rather than answering wrongly', async () => {
    const run = stored({ chunks: oneChunk, corrupt: 0 })
    await expect(turnWindow(run, 5, 6)).rejects.toThrow()
  })

  it('Answers with no turns for a run that has produced none, rather than failing', async () => {
    const w = await turnWindow({ id: 'empty', chunks: [],
                                 readChunk: async () => null,
                                 readSummary: async () => null, totalTurns: 0 }, 1, 10)
    expect(w.turns).toEqual([])
    expect(w.totalTurns).toBe(0)
    expect(w.from).toBe(1)
  })

  it('Holds a window that starts before the first turn', async () => {
    const w = await turnWindow(stored({ chunks: oneChunk }), -5, 3)
    expect(w.from).toBe(1)
    expect(w.turns.map((t) => t.tick)).toEqual([1, 2, 3])
  })

  it('Caps what one request will assemble', () => {
    expect(MAX_WINDOW).toBeLessThanOrEqual(500)
  })
})

describe('Putting an event into words', () => {
  it('Names the cat that caught a mouse', () => {
    const said = describeEvent({ kind: 'capture', tick: 1, seq: 1,
                                 catId: 'c0001', mouseId: 'm0002' } as never)
    expect(said.text).toBe('m0002 was caught by c0001.')
    expect(said.subject).toBe('m0002')
  })

  it('Calls total extinction what it is', () => {
    const said = describeEvent({ kind: 'run_ended', tick: 90, seq: 1,
                                 reason: 'extinct', finalTick: 90 } as never)
    expect(said.text).toMatch(/extinction/i)
  })

  it('Falls back to the event name for a kind it does not know', () => {
    const said = describeEvent({ kind: 'something_new', tick: 1, seq: 1, id: 'm0001' } as never)
    expect(said.kind).toBe('something_new')
    expect(said.text.length).toBeGreaterThan(0)
  })
})

describe('Reading the same chunk repeatedly', () => {
  it('Decodes it once, however many pages are asked for', async () => {
    // ISSUE-021. Paging a 250-turn chunk ten turns at a time decompressed the
    // same 2.2MB twenty-five times, synchronously, on the one thread.
    let reads = 0
    const run = stored({ chunks: oneChunk })
    const counted: StoredRun = {
      ...run,
      readChunk: (seq: number) => { reads++; return run.readChunk(seq) },
      readSummary: (seq: number) => run.readSummary(seq),
    }
    forget(counted.id)
    for (let page = 0; page < 10; page++) {
      const from = page * 10 + 1
      const w = await turnWindow(counted, from, from + 9)
      expect(w.turns).toHaveLength(10)
    }
    // Read once, for ten pages. This used to assert ten: the old contract
    // handed out a path, so the path was resolved on every page and only the
    // decode was cached. A reader is only called on a miss, so the cache now
    // avoids the read as well -- which matters more in the deployment, where a
    // read is a request to object storage rather than a local file.
    expect(reads).toBe(1)
    const again = await turnWindow(counted, 1, 10)
    expect(again.turns[0]?.stats.mice).toBe(10)
  })

  it('Forgets a run when told to', async () => {
    const run = stored({ chunks: oneChunk })
    await turnWindow(run, 1, 5)
    forget(run.id)
    // Still answers correctly from disk after the cache is dropped.
    const w = await turnWindow(run, 1, 5)
    expect(w.turns).toHaveLength(5)
  })

  it('Names the run it answered for', async () => {
    const run = stored({ chunks: oneChunk })
    const w = await turnWindow(run, 1, 3)
    expect(w.runId).toBe(run.id)
  })
})
