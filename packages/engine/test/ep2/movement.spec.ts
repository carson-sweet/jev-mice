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

  it('Scores every cell a mouse could step to, and only those', () => {
    // The falloff itself is tested directly in signals.spec.ts. This asserted
    // only the count while claiming to compare danger against food, so it would
    // have passed with both fields deleted.
    const e = engine(medium())
    const id = e.world().mice[0]!.id
    const here = e.world().mice[0]!.at
    const scores = e.candidateScores(id)
    expect(scores).toHaveLength(9)
    for (const s of scores) {
      expect(Math.max(Math.abs(s.cell.x - here.x), Math.abs(s.cell.y - here.y)))
        .toBeLessThanOrEqual(1)
      expect(Number.isFinite(s.total), `total was ${String(s.total)}`).toBe(true)
    }
    expect(scores.some((s) => s.cell.x === here.x && s.cell.y === here.y)).toBe(true)
  })
})
