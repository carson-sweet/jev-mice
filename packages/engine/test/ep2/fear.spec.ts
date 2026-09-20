// US-E02-04 Fear widens the berth
// Satisfies FR-043. Verifies SM-07.
//
// This is the specification that would have caught the defect the validation
// found: a fear factor applied as a magnitude is cancelled exactly by the
// normalization that follows, so the question would have had no effect at all.
import { describe, it, expect } from 'vitest'
import { createEngine, baselineProvider, type FearLevel } from '../../src/index.js'
import { medium, SEED } from '../helpers.js'

const LEVELS: FearLevel[] = ['unconcerned', 'wary', 'alarmed', 'panicked']

function dangerGradientAt(level: FearLevel): number[] {
  const e = createEngine({ config: medium({ cats: 4 }), seed: SEED, provider: baselineProvider() })
  const id = e.world().mice[0]!.id
  ;(e as unknown as { setFear(id: string, f: FearLevel): void }).setFear(id, level)
  return e.candidateScores(id).map((c) => c.danger)
}

describe('US-E02-04 Fear widens the berth', () => {
  it('Fear changes the shape of the danger gradient, not only its magnitude', () => {
    const grads = LEVELS.map(dangerGradientAt)
    for (let i = 1; i < grads.length; i++) {
      expect(grads[i], `${LEVELS[i]} produced the same gradient as ${LEVELS[i - 1]}`)
        .not.toEqual(grads[i - 1])
    }
  })

  it('A more frightened mouse gives danger a wider berth', () => {
    const calm = dangerGradientAt('unconcerned')
    const scared = dangerGradientAt('panicked')
    const spread = (v: number[]) => Math.max(...v) - Math.min(...v)
    expect(spread(scared)).toBeGreaterThan(spread(calm))
  })

  it('A panicked mouse re-decides after six ticks rather than twelve', () => {
    const e = createEngine({ config: medium(), seed: SEED, provider: baselineProvider() })
    const hold = (e as unknown as { intentHoldFor(level: FearLevel): number }).intentHoldFor
    expect(hold('panicked')).toBe(6)
    expect(hold('alarmed')).toBe(12)
  })
})
