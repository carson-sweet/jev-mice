// The wording the configuration screen is allowed to use about a run's odds.
//
// The whole point of showing a count rather than a percentage is that the
// reader sees the sample it rests on, so these tests are mostly about what the
// sentence must not quietly drop: the sample size, the fact that the settings
// were not the ones measured, and the fact that the sweep held other knobs
// fixed.

import { describe, it, expect } from 'vitest'
import { oddsWording } from '../src/odds.js'

const base = {
  survived: 13, measured: 16, ticks: 2000, exact: true,
  cell: { cats: 2, mouseholes: 16, foodPiles: 80, foodRespawnTicks: 145 },
  offAxis: [] as string[],
}

describe('Describing the measured odds', () => {
  it('Says nothing was measured when nothing was', () => {
    expect(oddsWording(null).headline).toBe('Not measured for these settings')
    expect(oddsWording(null).tone).toBe('unknown')
  })

  it('Leads with the count and its sample, not a percentage', () => {
    const w = oddsWording(base)
    expect(w.headline).toBe('Survived 13 of 16 measured runs')
    expect(w.headline).not.toContain('%')
  })

  it('Names the run length the figure is true for', () => {
    expect(oddsWording(base).detail).toContain('2,000 turns')
  })

  it('Admits when the settings are not the ones that were measured', () => {
    const w = oddsWording({ ...base, exact: false, cell: { ...base.cell, mouseholes: 24 } })
    expect(w.detail).toContain('nearest measured')
    expect(w.detail).toContain('24 mouseholes')
  })

  it('Names the knobs the sweep held fixed when this run moves them', () => {
    const w = oddsWording({ ...base, offAxis: ['traps', 'personality'] })
    expect(w.detail).toContain('traps')
    expect(w.detail).toContain('personality')
  })

  it('Grades the tone by how the colony actually fared', () => {
    expect(oddsWording({ ...base, survived: 16 }).tone).toBe('safe')
    expect(oddsWording({ ...base, survived: 12 }).tone).toBe('likely')
    expect(oddsWording({ ...base, survived: 8 }).tone).toBe('even')
    expect(oddsWording({ ...base, survived: 1 }).tone).toBe('doomed')
  })

  it('Writes one survival in the singular', () => {
    expect(oddsWording({ ...base, survived: 1 }).headline)
      .toBe('Survived 1 of 16 measured runs')
  })
})
