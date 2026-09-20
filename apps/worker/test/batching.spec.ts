// How far a single alarm advances a run.
//
// The tradeoff: a batch that is too long holds one invocation open for minutes
// at a slow pace, and a batch that is too short closes a chunk every few ticks
// and litters R2 with tiny objects. Ticks bound the top end, wall time bounds
// the bottom, and the pace decides which one binds.

import { describe, it, expect } from 'vitest'
import { CHUNK_TICKS } from '@jev-mice/sim'
import { batchSize, BATCH_SECONDS } from '../src/batching.js'

describe('Choosing how far one alarm advances a run', () => {
  it('Stops at a chunk boundary when the run is quick', () => {
    // At full pace a chunk takes under a second, so the chunk is what binds and
    // every batch lands exactly on a boundary.
    expect(batchSize(334, 20_000, 0)).toBe(CHUNK_TICKS)
  })

  it('Keeps a slow run to a bounded stretch of wall time', () => {
    // One tick a second would spend four minutes on a full chunk, with the
    // invocation open the whole time.
    expect(batchSize(1, 20_000, 0)).toBe(BATCH_SECONDS)
  })

  it('Never exceeds a chunk, whatever the pace', () => {
    expect(batchSize(10_000, 20_000, 0)).toBe(CHUNK_TICKS)
  })

  it('Treats an unthrottled run as a full chunk', () => {
    expect(batchSize(0, 20_000, 0)).toBe(CHUNK_TICKS)
  })

  it('Never advances past the end of the run', () => {
    // The last batch is short, and asking for more would run the engine past
    // the tick count the configuration asked for.
    expect(batchSize(334, 2_000, 1_900)).toBe(100)
  })

  it('Always advances at least one tick, so a run cannot stall', () => {
    expect(batchSize(0.01, 20_000, 0)).toBeGreaterThanOrEqual(1)
  })

  it('Asks for nothing once the run is over', () => {
    expect(batchSize(334, 2_000, 2_000)).toBe(0)
  })
})
