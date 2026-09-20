// How far one alarm advances a run.
//
// The engine runs inside the Run Durable Object (ADR-025), so a batch is one
// invocation. Two things bound it. A chunk is 250 ticks and closing on a
// boundary keeps stored objects the size the rest of the system expects, so
// that is the ceiling. Below that, a slow pace would hold the invocation open
// for minutes -- four of them for a full chunk at one tick a second -- so wall
// time is the other bound. Whichever is smaller wins.

import { CHUNK_TICKS } from '@jev-mice/sim'

/** The longest a single alarm should spend advancing a run. */
export const BATCH_SECONDS = 60

/**
 * Ticks for the next batch, given the pace, the run's length and where it has
 * got to. Zero means the run is done.
 */
export function batchSize(
  speed: number, totalTicks: number, currentTick: number,
): number {
  const remaining = totalTicks - currentTick
  if (remaining <= 0) return 0
  // Zero speed means unthrottled, which finishes a chunk in well under the
  // wall-clock bound, so the chunk is what binds.
  const byTime = speed > 0
    ? Math.max(1, Math.round(speed * BATCH_SECONDS))
    : CHUNK_TICKS
  return Math.min(CHUNK_TICKS, byTime, remaining)
}
