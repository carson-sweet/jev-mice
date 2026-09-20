// Turning a measured survival count into a sentence.
//
// The figure is deliberately a count and not a percentage. The sweep ran
// sixteen seeds a cell, which puts a reading of "half" inside roughly plus or
// minus twenty-five points; "50%" hides that and "8 of 16" does not. The
// sentence also has to carry its own conditions, because a survival figure is
// only true for one run length and for the knobs the sweep held fixed.

import type { SurvivalEstimate } from '@jev-mice/engine'

export type OddsTone = 'safe' | 'likely' | 'even' | 'doomed' | 'unknown'

export interface Odds {
  headline: string
  detail: string
  tone: OddsTone
}

/** Named after what the reader sees, not after a threshold. */
function toneFor(survived: number, measured: number): OddsTone {
  const share = measured === 0 ? 0 : survived / measured
  if (share >= 0.95) return 'safe'
  if (share >= 0.7) return 'likely'
  if (share >= 0.4) return 'even'
  return 'doomed'
}

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

export function oddsWording(e: SurvivalEstimate | null): Odds {
  if (e === null) {
    return {
      headline: 'Not measured for these settings',
      detail: 'The survival sweep did not cover this combination, so there is '
        + 'no honest figure to show. Run it and find out.',
      tone: 'unknown',
    }
  }

  const parts: string[] = [
    `Out of ${plural(e.measured, 'run', 'runs')} of these settings on different `
    + `seeds, ${plural(e.survived, 'colony', 'colonies')} still had living mice `
    + `after ${plural(e.ticks, 'turn', 'turns')}.`,
  ]

  if (!e.exact) {
    parts.push(
      'These are not the settings that were measured. The nearest measured '
      + `combination is ${plural(e.cell.mouseholes, 'mousehole', 'mouseholes')}, `
      + `${plural(e.cell.foodPiles, 'food pile', 'food piles')} and a respawn of `
      + `${plural(e.cell.foodRespawnTicks, 'turn', 'turns')}.`,
    )
  }

  if (e.offAxis.length > 0) {
    // Listed rather than summarised, because which knob moved decides how much
    // the figure is worth: a different trap count barely moved the outcome, a
    // different decay rate changed it entirely.
    parts.push(
      `The sweep held ${e.offAxis.join(', ')} fixed and this run does not, so `
      + 'treat the figure as a rough guide rather than a measurement.',
    )
  }

  return {
    headline: `Survived ${e.survived} of ${e.measured} measured runs`,
    detail: parts.join(' '),
    tone: toneFor(e.survived, e.measured),
  }
}
