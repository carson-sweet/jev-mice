// US-E01-08 Population caps and configuration validation
// Satisfies FR-001 to FR-003, FR-008, FR-054.
import { describe, it, expect } from 'vitest'
import { capsFor, validateConfig, PRESETS } from '../../src/index.js'
import { engine, medium, runTicks, of } from '../helpers.js'

describe('US-E01-08 Population caps and configuration validation', () => {
  it('Caps derive from grid area', () => {
    expect(PRESETS.medium).toEqual({ width: 80, height: 50 })
    expect(capsFor('medium')).toEqual({ mice: 160, food: 80, mouseholes: 80, traps: 40, cats: 10 })
  })

  it('A configuration above a cap is rejected with the cap named', () => {
    const errs = validateConfig(medium({ maleMice: 100, femaleMice: 100 }))
    const cap = errs.find((e) => e.code === 'above_cap')
    expect(cap).toBeDefined()
    expect(cap!.cap).toBe(160)
    expect(cap!.message).toMatch(/160/)
  })

  it('Personality percentages must total one hundred', () => {
    const errs = validateConfig(medium({
      personality: { bold: 70, cautious: 20, vigilant: 25, social: 25 } }))
    expect(errs.some((e) => e.code === 'sum_not_100')).toBe(true)
  })

  it('A tick count outside the range is rejected', () => {
    expect(validateConfig(medium({ ticks: 50 })).some((e) => e.code === 'out_of_range')).toBe(true)
    expect(validateConfig(medium({ ticks: 20001 })).some((e) => e.code === 'out_of_range')).toBe(true)
    expect(validateConfig(medium({ ticks: 2000 })).filter((e) => e.field === 'ticks')).toHaveLength(0)
  })

  it('A cell holds at most one animal', async () => {
    const e = engine(medium())
    await runTicks(e, 300)
    const occupied = new Map<string, number>()
    for (const a of [...e.world().mice.filter((m) => !m.inHole), ...e.world().cats]) {
      const k = `${a.at.x},${a.at.y}`
      occupied.set(k, (occupied.get(k) ?? 0) + 1)
    }
    for (const [cell, n] of occupied) expect(n, `cell ${cell} holds ${n} animals`).toBe(1)
  })
})
