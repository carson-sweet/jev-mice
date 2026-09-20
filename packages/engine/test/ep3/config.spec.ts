// US-E03-01 Configure and validate a run  /  US-E03-03 Export and import
// Satisfies FR-053 to FR-056, FR-109, FR-140.
import { describe, it, expect } from 'vitest'
import { defaultConfig, validateConfig, type RunConfig } from '../../src/index.js'
import { medium } from '../helpers.js'

describe('US-E03-01 Configure and validate a run', () => {
  // The numbers below changed with requirements v3.3, which replaced one
  // specified set with per-preset conditions chosen from a measured survival
  // sweep. The old values are in v3.2; they drove every seed extinct.
  it('Each preset opens on the conditions the requirements state', () => {
    expect(defaultConfig('small')).toMatchObject({
      preset: 'small', ticks: 2000,
      maleMice: 15, femaleMice: 15, cats: 1, traps: 4,
      foodPiles: 20, mouseholes: 16,
    })
    expect(defaultConfig('medium')).toMatchObject({
      preset: 'medium', ticks: 2000,
      maleMice: 30, femaleMice: 30, cats: 3, traps: 8,
      foodPiles: 60, mouseholes: 24,
    })
    expect(defaultConfig('large')).toMatchObject({
      preset: 'large', ticks: 2000,
      maleMice: 30, femaleMice: 30, cats: 4, traps: 8,
      foodPiles: 80, mouseholes: 32,
    })
    for (const preset of ['small', 'medium', 'large'] as const) {
      expect(defaultConfig(preset)).toMatchObject({
        foodRespawnTicks: 60, nutritionDecayPerTick: 0.3,
        personality: { bold: 25, cautious: 25, vigilant: 25, social: 25 },
      })
    }
  })

  it('A valid configuration produces no errors', () => {
    expect(validateConfig(defaultConfig('medium'))).toEqual([])
  })

  it('Errors name the field they belong beside', () => {
    for (const e of validateConfig(medium({ ticks: 50, cats: 99 }))) {
      expect(e.field).toBeTruthy()
      expect(e.message.length).toBeGreaterThan(0)
    }
  })
})

describe('US-E03-03 Export and import a configuration', () => {
  it('A configuration round-trips unchanged', () => {
    const original = medium({ maleMice: 21, personality: { bold: 70, cautious: 30, vigilant: 0, social: 0 } })
    const restored = JSON.parse(JSON.stringify(original)) as RunConfig
    expect(restored).toEqual(original)
    expect(validateConfig(restored)).toEqual([])
  })

  it('An imported configuration above a cap fails the same way a form does', () => {
    const imported = JSON.parse(JSON.stringify(medium({ maleMice: 200 }))) as RunConfig
    expect(validateConfig(imported).some((e) => e.code === 'above_cap')).toBe(true)
  })
})
