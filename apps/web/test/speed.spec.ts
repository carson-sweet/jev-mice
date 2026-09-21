// The slider's range depends on who is deciding.
//
// Offering 334 turns a second for a Jev run was a lie: Jev answers at about six
// a second and is the bottleneck, so every position above six asked for
// something that could not happen and the control appeared to do nothing. The
// range now stops where the decider does.

import { describe, it, expect } from 'vitest'
import { SPEED, SPEED_CEILING } from '@jev-mice/sim'
import { sliderFromSpeed, speedFromSlider } from '../src/api'

describe('How fast a run may be asked to go', () => {
  it('Stops at six a second for Jev, which is about what Jev achieves', () => {
    expect(SPEED_CEILING.jev).toBe(6)
  })

  it('Stops at fifty a second for the rules', () => {
    expect(SPEED_CEILING.rules).toBe(50)
  })

  it('Never offers less than the slowest pace', () => {
    for (const ceiling of Object.values(SPEED_CEILING)) {
      expect(ceiling).toBeGreaterThanOrEqual(SPEED.slowest)
    }
  })

  it('Puts the slider ends exactly on the slowest and the ceiling', () => {
    for (const ceiling of Object.values(SPEED_CEILING)) {
      expect(speedFromSlider(0, ceiling)).toBe(SPEED.slowest)
      expect(speedFromSlider(100, ceiling)).toBe(ceiling)
    }
  })

  it('Round-trips a pace through the slider and back', () => {
    // Otherwise the handle jumps away from where it was let go.
    for (const ceiling of Object.values(SPEED_CEILING)) {
      for (const speed of [1, 2, 3, 6]) {
        if (speed > ceiling) continue
        expect(speedFromSlider(sliderFromSpeed(speed, ceiling), ceiling)).toBe(speed)
      }
    }
  })

  it('Pins a pace above the ceiling to the top of the slider', () => {
    // A run started before the ceiling changed can still be carrying 334.
    expect(sliderFromSpeed(334, SPEED_CEILING.jev)).toBe(100)
  })
})
