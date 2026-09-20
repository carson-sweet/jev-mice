// Page arithmetic for a table of turns. Pages and turns are both counted from
// one, because that is how they read on screen; the only place zero appears is
// a run that has produced nothing yet.

/** The usual ladder. The server assembles at most five hundred turns at once. */
export const PAGE_SIZES: readonly number[] = [10, 25, 50, 100, 250] as const
export const DEFAULT_PAGE_SIZE = 50

/** At least one, so a control never reads "page 1 of 0". */
export function pageCount(total: number, perPage: number): number {
  if (perPage <= 0) return 1
  return Math.max(1, Math.ceil(Math.max(0, total) / perPage))
}

export function clampPage(page: number, total: number, perPage: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.max(1, Math.min(pageCount(total, perPage), Math.floor(page)))
}

export function rangeFor(
  page: number, perPage: number, total: number,
): { from: number; to: number } {
  const safe = clampPage(page, total, perPage)
  const from = (safe - 1) * perPage + 1
  // A run with no turns yet still asks for one, so the first request can learn
  // how many there are.
  const to = Math.max(from, Math.min(from + perPage - 1, Math.max(1, total)))
  return { from, to }
}

/**
 * The page a turn falls on. Used to hold a reader's place when the page size
 * changes, and to reach a turn by number without counting pages.
 */
export function pageContaining(turn: number, perPage: number): number {
  if (!Number.isFinite(turn) || perPage <= 0) return 1
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(turn)) / perPage))
}
