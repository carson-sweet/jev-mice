// US-E04-03 Resume after a failure
// Satisfies FR-093 to FR-096. Verifies SM-12.
//
// The snapshot round trip is the strongest correctness check in the project:
// any state the serializer misses, or any generator draw made out of order,
// shows up here and nowhere else.
import { describe, it, expect } from 'vitest'
import { restore, baselineProvider } from '../../src/index.js'
import { engine, medium, runTicks, comparable, SEED } from '../helpers.js'

describe('US-E04-03 Resume after a failure', () => {
  it('A restored engine behaves as if it never stopped', async () => {
    const straight = await runTicks(engine(medium(), SEED), 500)

    const first = engine(medium(), SEED)
    const firstHalf = await runTicks(first, 250)
    const snap = first.serialize()
    const second = restore(snap, { provider: baselineProvider() })
    const secondHalf = await runTicks(second, 250)

    expect(comparable([...firstHalf, ...secondHalf])).toEqual(comparable(straight))
  })

  it('A snapshot carries the generator state', async () => {
    const e = engine(medium(), SEED)
    await e.run(120)
    const snap = e.serialize()
    expect(snap.version).toBe(1)
    expect(snap.tick).toBe(120)
    expect(JSON.stringify(snap)).toMatch(/rng/)
  })

  it('A resumed stream has no gap and no repeated tick', async () => {
    const first = engine(medium(), SEED)
    const a = await runTicks(first, 250)
    const b = await runTicks(restore(first.serialize(), { provider: baselineProvider() }), 250)
    const ticks = [...a, ...b].map((e) => e.tick)
    for (let t = 1; t <= 500; t++) {
      expect(ticks.includes(t), `tick ${t} is missing from the resumed stream`).toBe(true)
    }
    expect(Math.max(...ticks)).toBe(500)
  })

  it('A snapshot round-trips through JSON', async () => {
    const e = engine(medium(), SEED)
    await e.run(200)
    const snap = JSON.parse(JSON.stringify(e.serialize()))
    const revived = restore(snap, { provider: baselineProvider() })
    expect(revived.world().tick).toBe(200)
  })
})
