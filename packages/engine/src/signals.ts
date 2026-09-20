// The four signal fields plus the exploration term, evaluated only at the nine
// cells a mouse could move to. Fields are min-max normalized across those nine
// before weighting, which is what makes the model's probabilities behave as
// weights rather than as arbitrary numbers.

import type { Cell, FearLevel } from './types.js'

export const chebyshev = (a: Cell, b: Cell): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/**
 * Fear scales the distance danger is felt over, not the size of the result.
 * A factor applied to the whole field would be cancelled exactly by the
 * normalization below and would have no effect at all.
 */
export const FEAR_FACTOR: Record<FearLevel, number> = {
  unconcerned: 0.5, wary: 1.0, alarmed: 1.5, panicked: 2.0,
}

export interface Sources {
  food: Cell[]          // piles the mouse can smell
  suspectFood: Cell[]   // traps it does not know about, at half weight
  knownTraps: Cell[]    // traps it does know about
  cats: Cell[]          // cats within perception
  mates: Cell[]         // eligible candidates within perception
  shelter: Cell[]       // free mouseholes
}

/** Food and shelter fall off linearly; a smell should carry across the room. */
const linear = (d: number): number => 1 / (1 + d)
/** Danger falls off quadratically; a cat should dominate near it and fade fast. */
const quadratic = (d: number): number => 1 / (1 + d) ** 2

export function foodAt(c: Cell, s: Sources): number {
  let v = 0
  for (const p of s.food) v += linear(chebyshev(c, p))
  for (const t of s.suspectFood) v += 0.5 * linear(chebyshev(c, t))
  return v
}

export function dangerAt(c: Cell, s: Sources, fear: FearLevel): number {
  const f = FEAR_FACTOR[fear]
  let v = 0
  for (const k of s.cats) v += 4 * quadratic(chebyshev(c, k) / f)
  for (const t of s.knownTraps) v += 2 * quadratic(chebyshev(c, t) / f)
  return v
}

export function mateAt(c: Cell, s: Sources): number {
  let v = 0
  for (const q of s.mates) v += linear(chebyshev(c, q))
  return v
}

export function shelterAt(c: Cell, s: Sources): number {
  let v = 0
  for (const h of s.shelter) v += linear(chebyshev(c, h))
  return v
}

/**
 * Exploration favours continuing the way the mouse has been going, which costs
 * one small vector rather than a visited-cell map per mouse.
 */
export function exploreAt(c: Cell, here: Cell, recent: readonly Cell[]): number {
  let mx = 0, my = 0
  for (let i = 1; i < recent.length; i++) {
    mx += recent[i]!.x - recent[i - 1]!.x
    my += recent[i]!.y - recent[i - 1]!.y
  }
  const len = Math.hypot(mx, my)
  const dx = c.x - here.x, dy = c.y - here.y
  const dlen = Math.hypot(dx, dy)
  if (len === 0 || dlen === 0) return 0.5
  return ((mx / len) * (dx / dlen) + (my / len) * (dy / dlen) + 1) / 2
}

export function normalize(values: readonly number[]): number[] {
  const lo = Math.min(...values), hi = Math.max(...values)
  if (hi - lo < 1e-12) return values.map(() => 0)
  return values.map((v) => (v - lo) / (hi - lo))
}

export const NEIGHBOURS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: 0 },
  { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
  { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 },
] as const
