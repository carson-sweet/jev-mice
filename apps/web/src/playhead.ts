// Where the view is looking, held as a turn number rather than a count back
// from the newest frame.
//
// Counting back from the end drifts: the same offset points at a newer frame
// every time one arrives, so the picture slides while the run continues and a
// scrubber handle stays put while its content moves. Naming a turn holds still.

/** A turn to look at, or null for whatever is newest. */
export type Playhead = number | null

/** The newest frame at or before the playhead, or -1 when nothing is held. */
export function indexFor(ticks: readonly number[], playhead: Playhead): number {
  if (ticks.length === 0) return -1
  if (playhead === null) return ticks.length - 1
  for (let i = ticks.length - 1; i >= 0; i--) {
    if ((ticks[i] ?? 0) <= playhead) return i
  }
  // Its turn has fallen out of the buffer; the oldest frame still held is the
  // closest thing to what was asked for.
  return 0
}

export interface Resolved {
  index: number
  /** Frames between here and the newest one. */
  behind: number
  live: boolean
  /** Where each control would move the playhead, or null for live. */
  back: Playhead
  forward: Playhead
  start: Playhead
  end: Playhead
  seek(index: number): Playhead
}

export function resolve(ticks: readonly number[], playhead: Playhead): Resolved {
  const last = ticks.length - 1
  const index = indexFor(ticks, playhead)
  const empty = index < 0
  // Pointing at the newest frame is being live, however it was reached, so
  // scrubbing to the end resumes following rather than freezing on that frame.
  const live = empty || index >= last
  const tickAt = (i: number): Playhead =>
    i >= last ? null : ticks[Math.max(0, i)] ?? null

  return {
    index,
    behind: empty ? 0 : last - index,
    live,
    back: empty ? null : ticks[Math.max(0, index - 1)] ?? null,
    forward: empty ? null : tickAt(index + 1),
    start: empty ? null : ticks[0] ?? null,
    end: null,
    seek: (i) => (empty ? null : tickAt(Math.min(last, Math.max(0, i)))),
  }
}

/** Zero-padded, so a changing number never changes the width of its label. */
export const pad = (n: number, width = 5): string =>
  String(Math.max(0, Math.floor(n))).padStart(width, '0')
