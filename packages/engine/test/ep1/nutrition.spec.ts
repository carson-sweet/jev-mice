// US-E01-03 Nutrition, speed and starvation
// Satisfies FR-010, FR-013, FR-014, FR-017. Verifies SM-09.
import { describe, it, expect } from 'vitest'
import { engine, medium, runTicks, of, mouse } from '../helpers.js'

describe('US-E01-03 Nutrition, speed and starvation', () => {
  it('Nutrition decays every tick', async () => {
    const e = engine(medium({ cats: 0, traps: 0, foodPiles: 0, nutritionDecayPerTick: 0.5 }))
    const id = e.world().mice[0]!.id
    await runTicks(e, 100)
    expect(mouse(e, id).nutrition).toBeCloseTo(50, 1)
  })

  it('A mouse starves when nutrition reaches zero', async () => {
    const e = engine(medium({ cats: 0, traps: 0, foodPiles: 0, nutritionDecayPerTick: 0.5 }))
    const evs = await runTicks(e, 220)
    const deaths = of(evs, 'death')
    expect(deaths.length).toBeGreaterThan(0)
    for (const d of deaths) expect(d.cause).toBe('starvation')
  })

  it('Every death carries exactly one cause', async () => {
    const evs = await runTicks(engine(medium()), 400)
    for (const d of of(evs, 'death')) {
      expect(['starvation', 'trap', 'cat']).toContain(d.cause)
      expect(Object.keys(d).filter((k) => k === 'cause')).toHaveLength(1)
    }
  })

  it('Eating restores nutrition and consumes the pile', async () => {
    const e = engine(medium({ cats: 0, traps: 0 }))
    const evs = await runTicks(e, 300)
    const eaten = of(evs, 'food_eaten')
    expect(eaten.length).toBeGreaterThan(0)
    const fed = mouse(e, eaten[0]!.id)
    expect(fed.nutrition).toBeGreaterThan(0)
    const pile = e.world().food.find((f) => f.id === eaten[0]!.foodId)!
    expect(pile.present).toBe(false)
  })
})
