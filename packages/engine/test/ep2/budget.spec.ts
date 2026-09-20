// US-E02-06 Living inside the request budget
// Satisfies FR-073, FR-086, NFR-001, NFR-008. Verifies SM-01.
import { describe, it, expect } from 'vitest'
import { composeRequests } from '../../src/index.js'

let n = 0
const ids = () => `b${++n}`
import { engine, medium } from '../helpers.js'

describe('US-E02-06 Living inside the request budget', () => {
  it('A Medium tick produces far fewer requests than one per decision-ready mouse', () => {
    const w = engine(medium()).world()
    const ready = w.mice.slice(0, 8).map((m) => m.id)
    const reqs = composeRequests(w, ready, ids)
    expect(reqs.length).toBeLessThanOrEqual(2)
  })

  it('The measured request rate leaves room under the published limit', () => {
    // Throughput is tiered, not flat: two ticks per second is promised up to
    // five concurrent runs, degrading beyond that as the budget is shared. An
    // earlier version of this spec asserted two ticks per second at twenty runs,
    // which the design never promised and no batching could deliver.
    const w = engine(medium()).world()
    const ready = w.mice.slice(0, 8).map((m) => m.id)
    const perTick = composeRequests(w, ready, ids).length
    expect(perTick * 2 * 5 * 60, 'five concurrent runs must fit the budget')
      .toBeLessThanOrEqual(1000)
  })
})
