import { describe, it, expect } from 'vitest'
import { defaultConfig, validateConfig, capsFor } from '../../src/index.js'

describe('A preset default', () => {
  it('Is a configuration that preset will actually accept', () => {
    for (const preset of ['small', 'medium', 'large'] as const) {
      expect(validateConfig(defaultConfig(preset)), preset).toEqual([])
    }
  })

  it('Stays within every cap the preset sets', () => {
    for (const preset of ['small', 'medium', 'large'] as const) {
      const c = defaultConfig(preset)
      const caps = capsFor(preset)
      expect(c.maleMice + c.femaleMice, `${preset} mice`).toBeLessThanOrEqual(caps.mice)
      expect(c.cats, `${preset} cats`).toBeLessThanOrEqual(caps.cats)
      expect(c.traps, `${preset} traps`).toBeLessThanOrEqual(caps.traps)
      expect(c.foodPiles, `${preset} food`).toBeLessThanOrEqual(caps.food)
      expect(c.mouseholes, `${preset} mouseholes`).toBeLessThanOrEqual(caps.mouseholes)
    }
  })
})

