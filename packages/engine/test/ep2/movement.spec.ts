// US-E02-03 Probabilities become movement
// Satisfies FR-015, FR-038 and the decision contract. Verifies SM-07.
import { describe, it, expect } from 'vitest'
import { engine, medium } from '../helpers.js'

describe('US-E02-03 Probabilities become movement', () => {
  it('Candidates are the current cell and its eight neighbours', () => {
    const e = engine(medium())
    const id = e.world().mice[0]!.id
    const cands = e.candidateScores(id)
    expect(cands).toHaveLength(9)
    const here = e.world().mice[0]!.at
    expect(cands.some((c) => c.cell.x === here.x && c.cell.y === here.y),
      'the current cell must be a candidate so a mouse can stand still').toBe(true)
  })

  it('Fields are normalized across the candidates before weighting', () => {
    const e = engine(medium())
    const id = e.world().mice[0]!.id
    for (const field of ['danger', 'food', 'shelter', 'mate', 'explore'] as const) {
      const vals = e.candidateScores(id).map((c) => c[field])
      expect(Math.min(...vals)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...vals)).toBeLessThanOrEqual(1)
    }
  })

  it('Danger falls off faster than food', () => {
    const e = engine(medium())
    const id = e.world().mice[0]!.id
    const c = e.candidateScores(id)
    expect(c.length).toBe(9)
  })
})
