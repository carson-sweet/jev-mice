// US-E02-06 Living inside the request budget
// Satisfies FR-073, FR-086, NFR-001, NFR-008. Verifies SM-01.
import { describe, it, expect } from 'vitest'
import { composeRequests } from '../../src/index.js'
import { engine, medium } from '../helpers.js'

describe('US-E02-06 Living inside the request budget', () => {
  it('A Medium tick produces far fewer requests than one per decision-ready mouse', () => {
    const w = engine(medium()).world()
    const ready = w.mice.slice(0, 8).map((m) => m.id)
    const reqs = composeRequests(w, ready)
    expect(reqs.length).toBeLessThanOrEqual(2)
  })

  it('The measured request rate leaves room under the published limit', () => {
    // 60 mice on an eight-tick cadence is 7.5 decision-ready mice per tick.
    // Spatial-sort batching must keep this near one request per tick, not seven:
    // at two ticks per second and twenty concurrent runs the deployment budget
    // is 1,000 requests per minute.
    const w = engine(medium()).world()
    const ready = w.mice.slice(0, 8).map((m) => m.id)
    const perTick = composeRequests(w, ready).length
    const worstCase = perTick * 2 * 20 * 60
    expect(worstCase, 'projected deployment request rate exceeds the budget')
      .toBeLessThanOrEqual(1000)
  })
})
