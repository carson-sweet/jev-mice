// What a visitor gets before touching anything.
//
// This is a cost decision as much as a product one, so it is pinned rather than
// left as whichever preset happened to be typed into a useState. Measured with
// the real tokens-per-request from a Jev run on the deployment: medium over
// 2,000 turns is about 20 cents of Jev, small about 15.
//
// Turns are the bigger lever -- halving them saves 58 percent against small's
// 27 -- and they are deliberately not halved. Nothing fails inside 1,000 turns:
// every configuration measured survives 800 and they only separate after 1,800,
// so a 1,000-turn default would show a colony climbing to its cap and nothing
// else, and the outcome the survival sweep exists to characterise would never
// happen.

import { describe, it, expect } from 'vitest'
import { defaultConfig, TICK_RANGE } from '@jev-mice/engine'
import { OPENING_PRESET } from '../src/opening.js'

describe('The configuration a visitor opens on', () => {
  it('Opens on the small world, to keep a first run cheap', () => {
    expect(OPENING_PRESET).toBe('small')
  })

  it('Keeps a run long enough for the colony’s fate to be decided', () => {
    // Below 1,800 turns nothing separates, so a shorter default would be
    // cheaper and would show nothing.
    expect(defaultConfig(OPENING_PRESET).ticks).toBeGreaterThanOrEqual(2_000)
  })

  it('Opens on something the deployment will accept', () => {
    expect(defaultConfig(OPENING_PRESET).ticks).toBeLessThanOrEqual(TICK_RANGE.max)
  })
})
