// The configuration validator, branch by branch. It is the one boundary between
// what a person types and what the engine runs, and several of its branches had
// no test. ISSUE-017.
import { describe, it, expect } from 'vitest'
import { defaultConfig, validateConfig, type RunConfig } from '../../src/index.js'

const config = (over: Partial<RunConfig> = {}): RunConfig =>
  ({ ...defaultConfig('medium'), ...over })
const fields = (c: RunConfig): string[] => validateConfig(c).map((e) => e.field).sort()

describe('A configuration the engine can run', () => {
  it('Passes every preset default', () => {
    for (const preset of ['small', 'medium', 'large'] as const) {
      expect(validateConfig(defaultConfig(preset)), preset).toEqual([])
    }
  })
})

describe('The world', () => {
  it('Refuses a preset that does not exist, rather than failing', () => {
    // Reachable from an imported configuration or a hand-made request. It threw
    // a TypeError out of capsFor, which the server turned into a bare 500.
    const errors = validateConfig(config({ preset: 'enormous' as never }))
    expect(errors.map((e) => e.field)).toContain('preset')
    expect(errors[0]?.message).toMatch(/small|medium|large/)
  })

  it('Refuses a missing preset', () => {
    expect(fields(config({ preset: undefined as never }))).toContain('preset')
  })
})

describe('The turn count', () => {
  it('Holds it between the stated bounds', () => {
    expect(fields(config({ ticks: 99 }))).toContain('ticks')
    expect(fields(config({ ticks: 20_001 }))).toContain('ticks')
    expect(validateConfig(config({ ticks: 100 }))).toEqual([])
    expect(validateConfig(config({ ticks: 20_000 }))).toEqual([])
  })

  it('Refuses a fraction of a turn', () => {
    expect(fields(config({ ticks: 500.5 }))).toContain('ticks')
  })

  it('Refuses a turn count that is not a number at all', () => {
    expect(fields(config({ ticks: Number.NaN }))).toContain('ticks')
    expect(fields(config({ ticks: Number.POSITIVE_INFINITY }))).toContain('ticks')
  })
})

describe('The counts of things', () => {
  it('Refuses a negative count', () => {
    expect(fields(config({ maleMice: -1 }))).toContain('maleMice')
    expect(fields(config({ cats: -3 }))).toContain('cats')
  })

  it('Refuses a fractional count', () => {
    expect(fields(config({ femaleMice: 2.5 }))).toContain('femaleMice')
    expect(fields(config({ traps: 0.1 }))).toContain('traps')
  })

  it('Refuses a count that is not a number', () => {
    expect(fields(config({ foodPiles: Number.NaN }))).toContain('foodPiles')
    expect(fields(config({ mouseholes: Number.POSITIVE_INFINITY }))).toContain('mouseholes')
  })

  it('Refuses more than the preset holds, and says how many it holds', () => {
    const errors = validateConfig(config({ cats: 999 }))
    const cats = errors.find((e) => e.field === 'cats')
    expect(cats?.code).toBe('above_cap')
    expect(cats?.cap).toBe(10)
    expect(cats?.message).toContain('999')
  })

  it('Counts the two sexes together against the cap on mice', () => {
    const errors = validateConfig(config({ maleMice: 100, femaleMice: 100 }))
    expect(errors.find((e) => e.field === 'mice')?.code).toBe('above_cap')
  })

  it('Accepts a world with nothing in it but mice', () => {
    expect(validateConfig(config({
      cats: 0, traps: 0, foodPiles: 0, mouseholes: 0,
    }))).toEqual([])
  })
})

describe('Nutrition', () => {
  it('Refuses decay of nothing, which would let a mouse live forever', () => {
    expect(fields(config({ nutritionDecayPerTick: 0 }))).toContain('nutritionDecayPerTick')
    expect(fields(config({ nutritionDecayPerTick: -1 }))).toContain('nutritionDecayPerTick')
  })

  it('Refuses decay above the stated ceiling', () => {
    expect(fields(config({ nutritionDecayPerTick: 10.5 }))).toContain('nutritionDecayPerTick')
    expect(validateConfig(config({ nutritionDecayPerTick: 10 }))).toEqual([])
  })

  it('Refuses decay that is not a number', () => {
    // NaN passed every comparison, so a mouse's nutrition became NaN, which is
    // never at or below zero, so nothing ever starved.
    expect(fields(config({ nutritionDecayPerTick: Number.NaN })))
      .toContain('nutritionDecayPerTick')
    expect(fields(config({ nutritionDecayPerTick: Number.POSITIVE_INFINITY })))
      .toContain('nutritionDecayPerTick')
  })

  it('Holds the starting nutrition between nothing and full', () => {
    expect(fields(config({ startingNutrition: 0 }))).toContain('startingNutrition')
    expect(fields(config({ startingNutrition: 101 }))).toContain('startingNutrition')
    expect(validateConfig(config({ startingNutrition: 1 }))).toEqual([])
    expect(validateConfig(config({ startingNutrition: 100 }))).toEqual([])
  })

  it('Refuses a starting nutrition that is not a number', () => {
    expect(fields(config({ startingNutrition: Number.NaN }))).toContain('startingNutrition')
  })

  it('Treats an absent starting nutrition as full', () => {
    const { startingNutrition: _drop, ...rest } = config()
    expect(validateConfig(rest as RunConfig)).toEqual([])
  })
})

describe('The personality mix', () => {
  it('Requires the four to total one hundred', () => {
    const errors = validateConfig(config({
      personality: { bold: 20, cautious: 20, vigilant: 20, social: 20 },
    }))
    expect(errors.find((e) => e.field === 'personality')?.code).toBe('sum_not_100')
    expect(errors[0]?.message).toContain('80')
  })

  it('Refuses one out of range even when the four still total one hundred', () => {
    // The sum check alone let this through: minus ten and a hundred and ten
    // total a hundred.
    const errors = validateConfig(config({
      personality: { bold: -10, cautious: 110, vigilant: 0, social: 0 },
    }))
    expect(errors.map((e) => e.field)).toContain('personality.bold')
    expect(errors.map((e) => e.field)).toContain('personality.cautious')
  })

  it('Refuses a percentage that is not a number', () => {
    // NaN made the sum NaN, and every comparison against NaN is false, so an
    // all-NaN mix validated and every mouse drawn came out social.
    const errors = validateConfig(config({
      personality: { bold: Number.NaN, cautious: 25, vigilant: 25, social: 25 },
    }))
    expect(errors.map((e) => e.field)).toContain('personality.bold')
  })

  it('Refuses a missing percentage', () => {
    const errors = validateConfig(config({
      personality: { cautious: 25, vigilant: 25, social: 25 } as never,
    }))
    expect(errors.length).toBeGreaterThan(0)
  })

  it('Accepts a mix that puts everything on one personality', () => {
    expect(validateConfig(config({
      personality: { bold: 100, cautious: 0, vigilant: 0, social: 0 },
    }))).toEqual([])
  })
})

describe('What an error carries', () => {
  it('Names a field, a code and something a person can read', () => {
    for (const bad of [
      config({ ticks: 1 }), config({ cats: -1 }), config({ nutritionDecayPerTick: 0 }),
      config({ personality: { bold: 0, cautious: 0, vigilant: 0, social: 0 } }),
      config({ preset: 'enormous' as never }),
    ]) {
      for (const e of validateConfig(bad)) {
        expect(e.field, JSON.stringify(e)).toBeTruthy()
        expect(e.code, JSON.stringify(e)).toBeTruthy()
        expect(e.message.length, JSON.stringify(e)).toBeGreaterThan(10)
        expect(e.message.endsWith('.'), e.message).toBe(true)
      }
    }
  })

  it('Reports every problem at once, not the first', () => {
    const errors = validateConfig(config({ ticks: 1, cats: -1, nutritionDecayPerTick: 0 }))
    expect(new Set(errors.map((e) => e.field)).size).toBeGreaterThanOrEqual(3)
  })
})
