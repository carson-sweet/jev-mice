// US-E01-07 Perception, memory and one-hop alarm
// Satisfies FR-037 to FR-042.
import { describe, it, expect } from 'vitest'
import { engine, medium, runTicks, of, mouse } from '../helpers.js'

describe('US-E01-07 Perception, memory and one-hop alarm', () => {
  it('Witnessing a death adds a memory tagged seen', async () => {
    const evs = await runTicks(engine(medium({ traps: 30, cats: 6 })), 900)
    const added = of(evs, 'memory_added').filter((m) => m.provenance === 'seen')
    expect(added.length).toBeGreaterThan(0)
    for (const m of added) {
      expect(m.sentence).toMatch(/saw|escaped/i)
      expect(['north','northeast','east','southeast','south','southwest','west','northwest'])
        .toContain(m.bearing)
    }
  })

  it('Memory is bounded at five and expires after three hundred ticks', async () => {
    const e = engine(medium({ traps: 30, cats: 8 }))
    await runTicks(e, 1200)
    for (const m of e.world().mice) {
      expect(m.memories.length).toBeLessThanOrEqual(5)
      for (const mem of m.memories) expect(e.world().tick - mem.addedAt).toBeLessThanOrEqual(300)
    }
  })

  it('An exchanged memory is tagged heard', async () => {
    const evs = await runTicks(engine(medium({ traps: 30, cats: 6 })), 900)
    const exchanges = of(evs, 'alarm_exchanged')
    expect(exchanges.length).toBeGreaterThan(0)
    for (const x of exchanges) {
      const added = of(evs, 'memory_added').find(
        (m) => m.id === x.to && m.sentence === x.sentence && m.tick === x.tick)
      expect(added?.provenance).toBe('heard')
    }
  })

  it('A heard memory is never passed on', async () => {
    const evs = await runTicks(engine(medium({ traps: 30, cats: 6 })), 1200)
    const heard = of(evs, 'memory_added').filter((m) => m.provenance === 'heard')
    for (const h of heard) {
      const relayed = of(evs, 'alarm_exchanged').filter(
        (x) => x.from === h.id && x.sentence === h.sentence && x.tick > h.tick)
      expect(relayed, 'a heard memory was relayed').toHaveLength(0)
    }
  })
})
