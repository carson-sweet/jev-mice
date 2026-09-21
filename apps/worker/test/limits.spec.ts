// The public deployment allows shorter runs than the engine does.
//
// 20,000 turns is fine on a laptop and is a lot to ask of a shared machine that
// anyone with the link can start work on: at six turns a second with Jev
// deciding it is nearly an hour of one slot. The ceiling is a deployment
// setting, not a constant, and it has to be enforced where the run is created
// rather than only offered in the form -- a form is a suggestion.

import { describe, it, expect } from 'vitest'
import { TICK_RANGE } from '@jev-mice/engine'
import { tickCeiling, tooManyTicks } from '../src/limits.js'

describe('How long a run may be on this deployment', () => {
  it('Takes the ceiling from configuration', () => {
    expect(tickCeiling({ MAX_TICKS: '10000' })).toBe(10_000)
  })

  it('Falls back to what the engine allows when nothing is configured', () => {
    expect(tickCeiling({})).toBe(TICK_RANGE.max)
    expect(tickCeiling({ MAX_TICKS: 'nonsense' })).toBe(TICK_RANGE.max)
  })

  it('Never offers more than the engine allows, whatever is configured', () => {
    expect(tickCeiling({ MAX_TICKS: '999999' })).toBe(TICK_RANGE.max)
  })

  it('Never offers less than the engine’s own minimum', () => {
    // A ceiling under the floor would make every run invalid.
    expect(tickCeiling({ MAX_TICKS: '1' })).toBe(TICK_RANGE.min)
  })

  it('Refuses a run past the ceiling, and says what the ceiling is', () => {
    const err = tooManyTicks(20_000, 10_000)
    expect(err).not.toBeNull()
    expect(err?.field).toBe('ticks')
    expect(err?.message).toContain('10,000')
  })

  it('Allows a run exactly at the ceiling', () => {
    expect(tooManyTicks(10_000, 10_000)).toBeNull()
  })

  it('Leaves anything under the ceiling alone', () => {
    expect(tooManyTicks(2_000, 10_000)).toBeNull()
  })
})
