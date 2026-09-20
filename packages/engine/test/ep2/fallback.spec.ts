// US-E02-05 Falling back to code-only rules
// Satisfies FR-069 to FR-071, FR-121. Verifies SM-15.
import { describe, it, expect } from 'vitest'
import { createEngine, baselineProvider, type DecisionProvider } from '../../src/index.js'
import { medium, SEED, runTicks, of, comparable } from '../helpers.js'

const never: DecisionProvider = { decide: () => new Promise(() => {}) }
const broken: DecisionProvider = { decide: () => Promise.reject(new Error('upstream')) }

describe('US-E02-05 Falling back to code-only rules', () => {
  it('A slow answer falls back and names the reason', async () => {
    const e = createEngine({ config: medium(), seed: SEED, provider: never })
    const evs = await runTicks(e, 40)
    const fb = of(evs, 'decision_fallback')
    expect(fb.length).toBeGreaterThan(0)
    expect(fb[0]!.reason).toBe('timeout')
  })

  it('An erroring provider falls back and the run continues', async () => {
    const e = createEngine({ config: medium({ ticks: 60 }), seed: SEED, provider: broken })
    const evs = await runTicks(e, 60)
    expect(of(evs, 'decision_fallback')[0]!.reason).toBe('error')
    expect(of(evs, 'run_ended')).toHaveLength(1)
  })

  it('Code-only answers are labelled as such', async () => {
    const evs = await runTicks(
      createEngine({ config: medium(), seed: SEED, provider: baselineProvider() }), 60)
    for (const d of of(evs, 'decision_returned')) expect(d.source).toBe('baseline')
  })

  it('A code-only run and a model run diverge only from the first decision', async () => {
    const a = await runTicks(
      createEngine({ config: medium(), seed: SEED, provider: baselineProvider() }), 60)
    const b = await runTicks(
      createEngine({ config: medium(), seed: SEED, provider: broken }), 60)
    const firstDecision = a.findIndex((e) => e.kind === 'decision_returned')
    expect(firstDecision).toBeGreaterThan(0)
    expect(comparable(b.slice(0, firstDecision))).toEqual(comparable(a.slice(0, firstDecision)))
  })
})
