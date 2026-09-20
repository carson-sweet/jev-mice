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

/**
 * The danger field is flat where no cat is in range, and a flat field normalizes
 * to zeros at every fear level. The first version of this spec took the first
 * mouse in the world and usually got exactly that, so it compared zeros.
 */
function threatenedMouse(e: ReturnType<typeof createEngine>): string {
  const w = e.world()
  const near = w.mice.find((m) => w.cats.some((c) =>
    Math.max(Math.abs(c.at.x - m.at.x), Math.abs(c.at.y - m.at.y)) <= 6))
  if (!near) throw new Error('no mouse has a cat within perception')
  return near.id
}

function dangerGradientAt(level: FearLevel): number[] {
  const e = createEngine({ config: medium({ cats: 10 }), seed: SEED, provider: baselineProvider() })
  const id = threatenedMouse(e)
  e.setFear(id, level)
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
    // Every normalized gradient runs from 0 to 1, so its range is always 1 and
    // says nothing. What widens is how much of the neighbourhood reads as
    // dangerous, which is the mean across the candidates.
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
    expect(mean(dangerGradientAt('panicked')))
      .toBeGreaterThan(mean(dangerGradientAt('unconcerned')))
  })

  it('A panicked mouse re-decides after six ticks rather than twelve', () => {
    const e = createEngine({ config: medium(), seed: SEED, provider: baselineProvider() })
    expect(e.intentHoldFor('panicked')).toBe(6)
    expect(e.intentHoldFor('alarmed')).toBe(12)
  })
})
