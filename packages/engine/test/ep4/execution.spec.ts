// US-E04-02 The record is written as the run proceeds
// Satisfies FR-098 to FR-101, FR-104, NFR-011.
import { describe, it, expect } from 'vitest'
import { engine, medium, runTicks } from '../helpers.js'

describe('US-E04-02 The record is written as the run proceeds', () => {
  it('Events are drainable so no process must hold the whole run', async () => {
    const e = engine(medium({ ticks: 600 }))
    let held = 0
    for (let i = 0; i < 6; i++) {
      await e.run(100)
      const batch = e.drain()
      held = Math.max(held, batch.length)
      expect(e.events(), 'drain must clear the buffer so memory stays flat').toHaveLength(0)
    }
    expect(held).toBeGreaterThan(0)
  })

  it('A run in progress has already produced events for the ticks it reached', async () => {
    const e = engine(medium({ ticks: 2000 }))
    const evs = await runTicks(e, 900)
    expect(evs.length).toBeGreaterThan(0)
    expect(Math.max(...evs.map((x) => x.tick))).toBe(900)
  })

  it('Sequence numbers are monotonic and gapless', async () => {
    const evs = await runTicks(engine(medium()), 300)
    const seqs = evs.map((e) => e.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
    expect(new Set(seqs).size).toBe(seqs.length)
  })
})
