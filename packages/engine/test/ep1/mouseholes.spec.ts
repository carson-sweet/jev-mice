// US-E01-06 Mouseholes shelter, breed and raise pups
// Satisfies FR-009 to FR-011, FR-020, FR-044 to FR-050.
import { describe, it, expect } from 'vitest'
import { engine, medium, runTicks, of, mouse } from '../helpers.js'

describe('US-E01-06 Mouseholes shelter, breed and raise pups', () => {
  it('A hiding mouse cannot be caught', async () => {
    const e = engine(medium({ cats: 8, mouseholes: 20 }))
    const evs = await runTicks(e, 800)
    const sheltered = new Set(of(evs, 'hole_entered').map((h) => h.id))
    for (const c of of(evs, 'capture')) {
      const enteredBefore = of(evs, 'hole_entered').some(
        (h) => h.id === c.mouseId && h.tick < c.tick &&
               !of(evs, 'hole_left').some((l) => l.id === c.mouseId && l.tick > h.tick && l.tick < c.tick))
      expect(enteredBefore, `${c.mouseId} was captured while sheltering`).toBe(false)
    }
    expect(sheltered.size).toBeGreaterThan(0)
  })

  it('A hiding mouse still gets hungry and leaves', async () => {
    const evs = await runTicks(engine(medium({ cats: 6, mouseholes: 20 })), 1200)
    const entered = of(evs, 'hole_entered').find((h) => h.as === 'adult')
    expect(entered).toBeDefined()
    const left = of(evs, 'hole_left').find((l) => l.id === entered!.id && l.tick > entered!.tick)
    expect(left).toBeDefined()
  })

  it('A hole holds one adult or one brood, never both', async () => {
    const e = engine(medium({ cats: 6, mouseholes: 4 }))
    await runTicks(e, 1000)
    for (const h of e.world().holes) expect(['empty', 'adult', 'brood']).toContain(h.occupancy)
    const occupantsPerHole = new Map<string, number>()
    for (const m of e.world().mice) if (m.inHole) {
      occupantsPerHole.set(m.inHole, (occupantsPerHole.get(m.inHole) ?? 0) + 1)
    }
    for (const [hole, n] of occupantsPerHole) {
      const occ = e.world().holes.find((h) => h.id === hole)!.occupancy
      if (occ === 'adult') expect(n).toBe(1)
    }
  })

  it('Breeding requires a free hole nearby', async () => {
    const evs = await runTicks(engine(medium({ mouseholes: 0, cats: 0 })), 1500)
    expect(of(evs, 'mating')).toHaveLength(0)
    expect(of(evs, 'birth')).toHaveLength(0)
  })

  it('A litter is born into a hole and emerges about thirty ticks later', { timeout: 30_000 }, async () => {
    const evs = await runTicks(engine(medium({ cats: 0, mouseholes: 30, foodPiles: 60 })), 2000)
    const brood = of(evs, 'brood_born')[0]
    expect(brood).toBeDefined()
    expect(brood!.pups.length).toBeGreaterThanOrEqual(2)
    expect(brood!.pups.length).toBeLessThanOrEqual(4)
    const freed = of(evs, 'hole_freed').find((f) => f.holeId === brood!.holeId && f.tick > brood!.tick)
    expect(freed).toBeDefined()
    expect(freed!.tick - brood!.tick).toBeGreaterThanOrEqual(25)
    expect(freed!.tick - brood!.tick).toBeLessThanOrEqual(40)
  })

  it('A birth beyond the population cap is lost and recorded', { timeout: 30_000 }, async () => {
    const evs = await runTicks(
      engine(medium({ maleMice: 78, femaleMice: 78, cats: 0, mouseholes: 60, foodPiles: 80 })), 2000)
    expect(of(evs, 'cap_limited_birth').length).toBeGreaterThan(0)
  })
})
