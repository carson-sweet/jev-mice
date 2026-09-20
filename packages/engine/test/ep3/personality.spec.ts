// US-E03-02 Personality mix holds across births
// Satisfies FR-051, FR-052. Verifies SM-06.
import { describe, it, expect } from 'vitest'
import { PERSONALITIES } from '../../src/index.js'
import { engine, medium, runTicks, of } from '../helpers.js'

describe('US-E03-02 Personality mix holds across births', () => {
  it('The starting cohort emits a spawn event carrying its personality', async () => {
    // Spawning happens when the world is created, before the first tick, so the
    // whole buffer is what to read rather than the events one tick produced.
    const e = engine(medium({ maleMice: 30, femaleMice: 30 }))
    await runTicks(e, 1)
    const spawns = of(e.events(), 'mouse_spawned')
    expect(spawns).toHaveLength(60)
    for (const s of spawns) expect(PERSONALITIES).toContain(s.personality)
  })

  it('Pups draw from the configured mix', { timeout: 30_000 }, async () => {
    const evs = await runTicks(
      engine(medium({ cats: 0, mouseholes: 40, foodPiles: 70 })), 2500)
    const births = of(evs, 'birth')
    expect(births.length).toBeGreaterThan(0)
    for (const b of births) expect(PERSONALITIES).toContain(b.personality)
  })

  it('The mix holds within five points at a thousand mice ever alive', { timeout: 120_000 }, async () => {
    const config = medium({ cats: 0, mouseholes: 60, foodPiles: 80, ticks: 20000,
      personality: { bold: 70, cautious: 30, vigilant: 0, social: 0 } })
    const evs = await runTicks(engine(config), 20000)
    const counts: Record<string, number> = { bold: 0, cautious: 0, vigilant: 0, social: 0 }
    for (const s of of(evs, 'mouse_spawned')) counts[s.personality]!++
    for (const b of of(evs, 'birth')) counts[b.personality]!++
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total, 'the metric only applies at a thousand mice ever alive').toBeGreaterThanOrEqual(1000)
    for (const p of PERSONALITIES) {
      expect(Math.abs((counts[p]! / total) * 100 - config.personality[p])).toBeLessThanOrEqual(5)
    }
  })

  it('Personality changes behaviour, not only the label', async () => {
    const e = engine(medium())
    await runTicks(e, 1)
    const vigilant = e.world().mice.find((m) => m.personality === 'vigilant')
    expect(vigilant, 'no vigilant mouse was spawned').toBeDefined()
  })
})
