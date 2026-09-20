// The turn table's columns, in order, as one list.
//
// Headers and cells were two parallel arrays, which can drift: a header reading
// Mice could end up over the cat count with nothing to catch it. One list
// describes both.

import type { TurnStats } from './api'

/**
 * A count column carries the stat it reads, which is what lets the renderer
 * tell it from the turn number and the summary without a second list.
 */
export type TurnColumn =
  | { key: 'turn'; head: string }
  | { key: 'happened'; head: string }
  | { key: keyof TurnStats; head: string; stat: keyof TurnStats }

export const TURN_COLUMNS: readonly TurnColumn[] = [
  { key: 'turn', head: 'Turn' },
  // Immediately right of the turn number: it is what a reader scans for, and
  // the counts are the detail beside it.
  { key: 'happened', head: 'What happened' },
  { key: 'mice', head: 'Mice', stat: 'mice' },
  { key: 'cats', head: 'Cats', stat: 'cats' },
  { key: 'food', head: 'Food', stat: 'food' },
  { key: 'traps', head: 'Traps', stat: 'traps' },
] as const

/**
 * How many leading cells an opened turn leaves empty. One, for the turn
 * number, so its events start exactly where "What happened" starts above them.
 */
export const EXPANSION_INDENT = 1
