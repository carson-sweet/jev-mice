// US-E01-05 Food, traps and evasion
// Satisfies FR-031 to FR-036. Verifies SM-09.
import { describe, it, expect } from 'vitest'
import { engine, medium, runTicks, of } from '../helpers.js'

describe('US-E01-05 Food, traps and evasion', () => {
  const evasionRate = (evs: ReturnType<typeof of<'evasion_rolled'>>, band: (n: number) => boolean) => {
    const rolls = evs.filter((e) => band(e.nutrition))
    return { n: rolls.length, rate: rolls.filter((r) => r.evaded).length / rolls.length }
  }

  it('A full mouse evades a trap half the time', async () => {
    const evs = await runTicks(engine(medium({ traps: 40, foodPiles: 80, cats: 0 })), 4000)
    const { n, rate } = evasionRate(of(evs, 'evasion_rolled'), (x) => x >= 95)
    expect(n).toBeGreaterThan(200)
    expect(rate).toBeGreaterThan(0.45)
    expect(rate).toBeLessThan(0.55)
  })

  it('Evasion erodes with nutrition', async () => {
    const evs = await runTicks(engine(medium({ traps: 40, cats: 0 })), 4000)
    const full = evasionRate(of(evs, 'evasion_rolled'), (x) => x >= 95)
    const lean = evasionRate(of(evs, 'evasion_rolled'), (x) => x >= 35 && x <= 45)
    expect(lean.rate).toBeLessThan(full.rate)
  })

  it('The stated chance is nutrition dependent', async () => {
    const evs = await runTicks(engine(medium({ traps: 40, cats: 0 })), 2000)
    for (const r of of(evs, 'evasion_rolled')) {
      expect(r.chance).toBeCloseTo(0.5 * (r.nutrition / 100), 5)
    }
  })

  it('A trapped mouse blocks the trap then the trap moves', async () => {
    const evs = await runTicks(engine(medium({ traps: 20, cats: 0 })), 1200)
    const trapped = of(evs, 'mouse_trapped')[0]
    expect(trapped).toBeDefined()
    const respawn = of(evs, 'trap_respawned').find((r) => r.trapId === trapped!.trapId)
    expect(respawn).toBeDefined()
    expect(respawn!.tick - trapped!.tick).toBe(10)
  })

  it('A consumed food pile respawns after the configured interval', async () => {
    const evs = await runTicks(engine(medium({ foodRespawnTicks: 40, cats: 0 })), 800)
    const eaten = of(evs, 'food_eaten')[0]
    expect(eaten).toBeDefined()
    const back = of(evs, 'food_respawned').find((r) => r.foodId === eaten!.foodId)
    expect(back).toBeDefined()
    expect(back!.tick - eaten!.tick).toBe(40)
  })
})
