// The world a visitor opens on.
//
// Small rather than medium, because a first run is paid for by whoever deployed
// this: measured against a real Jev run, medium over 2,000 turns is about 20
// cents of Jev and small about 15.
//
// The turn count is deliberately left alone. Halving it to 1,000 would save far
// more -- 58 percent against small's 27 -- but nothing fails inside 1,000
// turns. Every configuration measured survives 800 and they only begin to
// separate after 1,800, so a 1,000-turn default would show a population
// climbing to its cap and stopping, and a visitor would never see the thing the
// simulation is for.

import type { Preset } from '@jev-mice/engine'

export const OPENING_PRESET: Preset = 'small'
