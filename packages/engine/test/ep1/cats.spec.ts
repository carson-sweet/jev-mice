// US-E01-04 Cats hunt, capture and eat
// Satisfies FR-022 to FR-030. Verifies SM-09.
import { describe, it, expect } from 'vitest'
import { engine, medium, runTicks, of } from '../helpers.js'

describe('US-E01-04 Cats hunt, capture and eat', () => {
  it('A cat captures a mouse it moves onto', async () => {
    const evs = await runTicks(engine(medium({ cats: 8, mouseholes: 0 })), 600)
    const caps = of(evs, 'capture')
    expect(caps.length).toBeGreaterThan(0)
    for (const c of caps) {
      const death = of(evs, 'death').find((d) => d.id === c.mouseId)
      expect(death?.cause).toBe('cat')
    }
  })

  it('An eating cat is stationary for ten ticks', async () => {
    const evs = await runTicks(engine(medium({ cats: 8, mouseholes: 0 })), 600)
    const started = of(evs, 'cat_eating_started')[0]
    expect(started).toBeDefined()
    const ended = of(evs, 'cat_eating_ended').find((x) => x.id === started!.id)
    expect(ended).toBeDefined()
    expect(ended!.tick - started!.tick).toBe(10)
    const movedWhileEating = of(evs, 'moved').filter(
      (m) => m.id === started!.id && m.tick > started!.tick && m.tick <= ended!.tick)
    expect(movedWhileEating).toHaveLength(0)
  })

  it('A cat gives up on a target it cannot close on', async () => {
    const evs = await runTicks(engine(medium({ cats: 4 })), 800)
    const targeted = of(evs, 'cat_targeted')
    const drops = targeted.filter((t) => t.target === null)
    expect(drops.length).toBeGreaterThan(0)
  })

  it('A cat loses a target that reaches shelter', async () => {
    const evs = await runTicks(engine(medium({ cats: 6, mouseholes: 20 })), 800)
    const entered = of(evs, 'hole_entered')
    expect(entered.length).toBeGreaterThan(0)
    const afterShelter = of(evs, 'cat_targeted').filter(
      (t) => t.target === null && t.tick >= entered[0]!.tick)
    expect(afterShelter.length).toBeGreaterThan(0)
  })

  it('A cat is unharmed by traps and ignores food', async () => {
    const evs = await runTicks(engine(medium({ cats: 6, traps: 20 })), 600)
    const catIds = new Set(engine(medium({ cats: 6 })).world().cats.map((c) => c.id))
    for (const d of of(evs, 'death')) expect(catIds.has(d.id)).toBe(false)
    for (const f of of(evs, 'food_eaten')) expect(f.id.startsWith('c')).toBe(false)
  })
})
