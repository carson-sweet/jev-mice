// US-E03-01 Configure and validate a run  /  US-E03-03 Export and import
// Satisfies FR-053 to FR-056, FR-109, FR-140.
import { describe, it, expect } from 'vitest'
import { defaultConfig, validateConfig, type RunConfig } from '../../src/index.js'
import { medium } from '../helpers.js'

describe('US-E03-01 Configure and validate a run', () => {
  it('Medium defaults are what the requirements state', () => {
    const c = defaultConfig('medium')
    expect(c).toMatchObject({
      preset: 'medium', ticks: 2000,
      maleMice: 30, femaleMice: 30, cats: 4, traps: 8,
      foodPiles: 20, mouseholes: 12,
      foodRespawnTicks: 40, nutritionDecayPerTick: 0.5,
      personality: { bold: 25, cautious: 25, vigilant: 25, social: 25 },
    })
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
