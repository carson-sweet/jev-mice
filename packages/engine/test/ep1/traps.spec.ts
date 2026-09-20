// US-E01-05 Food, traps and evasion
// Satisfies FR-031 to FR-036. Verifies SM-09.
import { describe, it, expect } from 'vitest'
import { engine, medium, runTicks, of } from '../helpers.js'

describe('US-E01-05 Food, traps and evasion', () => {
  const evasionRate = (evs: ReturnType<typeof of<'evasion_rolled'>>, band: (n: number) => boolean) => {
    const rolls = evs.filter((e) => band(e.nutrition))
    return { n: rolls.length, rate: rolls.filter((r) => r.evaded).length / rolls.length }
  }

  it('A full mouse evades a trap half the time', { timeout: 60_000 }, async () => {
    // A denser world produces enough encounters to say anything, and the bound
    // is four standard errors of the sample actually collected rather than a
    // fixed window that a small sample could fail by luck alone.
    const evs = await runTicks(engine(medium({
      traps: 40, foodPiles: 80, mouseholes: 60, cats: 0,
      maleMice: 78, femaleMice: 78, nutritionDecayPerTick: 0.2, foodRespawnTicks: 10,
    })), 8000)
    const { n, rate } = evasionRate(of(evs, 'evasion_rolled'), (x) => x >= 95)
    expect(n, 'too few full-nutrition trap entries to judge the rate').toBeGreaterThan(100)
    const tolerance = 4 * Math.sqrt(0.25 / n)
    expect(Math.abs(rate - 0.5)).toBeLessThan(tolerance)
  })

  it('Evasion erodes with nutrition', { timeout: 60_000 }, async () => {
    const evs = await runTicks(engine(medium({ traps: 40, cats: 0 })), 4000)
    const full = evasionRate(of(evs, 'evasion_rolled'), (x) => x >= 95)
    const lean = evasionRate(of(evs, 'evasion_rolled'), (x) => x >= 35 && x <= 45)
    expect(lean.rate).toBeLessThan(full.rate)
  })

  it('The stated chance is nutrition dependent', { timeout: 30_000 }, async () => {
    const evs = await runTicks(engine(medium({ traps: 40, cats: 0 })), 2000)
    for (const r of of(evs, 'evasion_rolled')) {
      expect(r.chance).toBeCloseTo(0.5 * (r.nutrition / 100), 5)
    }
  })

  it('A trapped mouse blocks the trap then the trap moves', { timeout: 30_000 }, async () => {
    const evs = await runTicks(engine(medium({ traps: 20, cats: 0 })), 1200)
    const trapped = of(evs, 'mouse_trapped')[0]
    expect(trapped).toBeDefined()
    const respawn = of(evs, 'trap_respawned').find((r) => r.trapId === trapped!.trapId)
    expect(respawn).toBeDefined()
    expect(respawn!.tick - trapped!.tick).toBe(10)
  })

  it('A consumed food pile respawns after the configured interval', { timeout: 30_000 }, async () => {
    const evs = await runTicks(engine(medium({ foodRespawnTicks: 40, cats: 0 })), 800)
    const eaten = of(evs, 'food_eaten')[0]
    expect(eaten).toBeDefined()
    const back = of(evs, 'food_respawned').find((r) => r.foodId === eaten!.foodId)
    expect(back).toBeDefined()
    expect(back!.tick - eaten!.tick).toBe(40)
  })
})
