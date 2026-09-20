// The signal fields, tested directly. ISSUE-017: this module had no test at
// all, and it is where the fear-as-divisor subtlety lives. A test named after
// the falloff existed but asserted only that nine cells came back.
import { describe, it, expect } from 'vitest'
import {
  chebyshev, foodAt, dangerAt, mateAt, shelterAt, exploreAt, normalize,
  FEAR_FACTOR, NEIGHBOURS, type Sources,
} from '../../src/index.js'

const empty: Sources = {
  food: [], suspectFood: [], knownTraps: [], cats: [], mates: [], shelter: [],
}
const at = (x: number, y: number) => ({ x, y })
const origin = at(0, 0)

describe('Distance', () => {
  it('Is the longer of the two axes, so a diagonal step is one', () => {
    expect(chebyshev(origin, at(1, 1))).toBe(1)
    expect(chebyshev(origin, at(3, 1))).toBe(3)
    expect(chebyshev(origin, at(-4, 2))).toBe(4)
    expect(chebyshev(origin, origin)).toBe(0)
  })
})

describe('Falloff', () => {
  it('Makes danger fall away faster than food', () => {
    // The claim the old test's name made and never checked.
    const food = (d: number) => foodAt(origin, { ...empty, food: [at(d, 0)] })
    const danger = (d: number) => dangerAt(origin, { ...empty, cats: [at(d, 0)] }, 'wary')
    const foodRatio = food(4) / food(1)
    const dangerRatio = danger(4) / danger(1)
    expect(dangerRatio).toBeLessThan(foodRatio)
    // Linear against quadratic: food keeps 40 percent of its strength at four
    // cells, danger keeps 16.
    expect(foodRatio).toBeCloseTo(0.4, 6)
    expect(dangerRatio).toBeCloseTo(0.16, 6)
  })

  it('Weighs food, a trap it knows about, and a trap it does not', () => {
    const food = foodAt(origin, { ...empty, food: [at(2, 0)] })
    const suspect = foodAt(origin, { ...empty, suspectFood: [at(2, 0)] })
    expect(suspect).toBeCloseTo(food / 2, 6)
    const cat = dangerAt(origin, { ...empty, cats: [at(2, 0)] }, 'wary')
    const trap = dangerAt(origin, { ...empty, knownTraps: [at(2, 0)] }, 'wary')
    expect(trap).toBeCloseTo(cat / 2, 6)
  })

  it('Adds up over several sources', () => {
    const one = foodAt(origin, { ...empty, food: [at(2, 0)] })
    const two = foodAt(origin, { ...empty, food: [at(2, 0), at(0, 2)] })
    expect(two).toBeCloseTo(one * 2, 6)
  })

  it('Is nothing at all with nothing to sense', () => {
    expect(foodAt(origin, empty)).toBe(0)
    expect(dangerAt(origin, empty, 'panicked')).toBe(0)
    expect(mateAt(origin, empty)).toBe(0)
    expect(shelterAt(origin, empty)).toBe(0)
  })

  it('Treats a mate and a mousehole like food, falling off linearly', () => {
    const mate = mateAt(origin, { ...empty, mates: [at(3, 0)] })
    const hole = shelterAt(origin, { ...empty, shelter: [at(3, 0)] })
    expect(mate).toBeCloseTo(0.25, 6)
    expect(hole).toBeCloseTo(0.25, 6)
  })
})

describe('Fear', () => {
  it('Widens the distance danger is felt over rather than scaling the field', () => {
    // A factor on the whole field would be cancelled exactly by the
    // normalization that follows, and would do nothing. What must change is
    // how much of the neighbourhood reads as dangerous.
    const spread = (fear: Parameters<typeof dangerAt>[2]): number[] => {
      const cat = at(5, 0)
      const raw = NEIGHBOURS.map(({ dx, dy }) =>
        dangerAt(at(dx, dy), { ...empty, cats: [cat] }, fear))
      return normalize(raw)
    }
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
    expect(mean(spread('panicked'))).toBeGreaterThan(mean(spread('unconcerned')))
    expect(mean(spread('alarmed'))).toBeGreaterThan(mean(spread('wary')))
  })

  it('Runs from unconcerned to panicked in increasing order', () => {
    expect(FEAR_FACTOR.unconcerned).toBeLessThan(FEAR_FACTOR.wary)
    expect(FEAR_FACTOR.wary).toBeLessThan(FEAR_FACTOR.alarmed)
    expect(FEAR_FACTOR.alarmed).toBeLessThan(FEAR_FACTOR.panicked)
  })
})

describe('Exploration', () => {
  it('Favours carrying on the way the mouse was going', () => {
    const recent = [at(0, 0), at(1, 0), at(2, 0)]
    const here = at(2, 0)
    const onward = exploreAt(at(3, 0), here, recent)
    const back = exploreAt(at(1, 0), here, recent)
    expect(onward).toBeGreaterThan(back)
    expect(onward).toBeCloseTo(1, 6)
    expect(back).toBeCloseTo(0, 6)
  })

  it('Has no opinion before the mouse has moved', () => {
    expect(exploreAt(at(1, 0), origin, [origin])).toBe(0.5)
    expect(exploreAt(origin, origin, [at(0, 0), at(1, 0)])).toBe(0.5)
  })
})

describe('Normalizing across the cells a mouse could step to', () => {
  it('Puts the lowest at nothing and the highest at one', () => {
    expect(normalize([2, 4, 6])).toEqual([0, 0.5, 1])
  })

  it('Flattens a field with nothing to choose between', () => {
    expect(normalize([5, 5, 5])).toEqual([0, 0, 0])
    expect(normalize([0, 0])).toEqual([0, 0])
    expect(normalize([3])).toEqual([0])
  })

  it('Handles negatives without inverting them', () => {
    expect(normalize([-2, 0, 2])).toEqual([0, 0.5, 1])
  })
})

describe('The cells a mouse can step to', () => {
  it('Are the nine including standing still, each reachable in one step', () => {
    expect(NEIGHBOURS).toHaveLength(9)
    expect(NEIGHBOURS[0]).toEqual({ dx: 0, dy: 0 })
    for (const n of NEIGHBOURS) {
      expect(Math.max(Math.abs(n.dx), Math.abs(n.dy))).toBeLessThanOrEqual(1)
    }
    const seen = new Set(NEIGHBOURS.map((n) => `${String(n.dx)},${String(n.dy)}`))
    expect(seen.size).toBe(9)
  })
})
