// Narrowing the two logs to one tracked thing.
//
// The distinction the panels have to make honestly: some things on the map
// decide, and some are decided about. A mouse and a cat have judgment to show.
// A food pile, a trap and a mousehole never answer a question, so their
// decisions list is empty -- and the panel says why rather than looking broken.

import type { DecisionLine, LogEntry } from '@jev-mice/sim'
import { kindOf } from './kinds'

/** Whether this thing is ever asked anything. */
export function decides(id: string): boolean {
  const kind = kindOf(id)
  return kind === 'mouse' || kind === 'cat'
}

/**
 * Whether a line is about this id.
 *
 * Bounded so that m0001 does not match m00011: the log names things inside
 * sentences, and a prefix match would quietly pull in a different animal.
 */
const mentions = (text: string, id: string): boolean =>
  new RegExp(`(^|[^0-9A-Za-z])${id}([^0-9A-Za-z]|$)`).test(text)

export function logFor(entries: readonly LogEntry[], id: string | null): LogEntry[] {
  if (id === null) return [...entries]
  return entries.filter((e) => e.subject === id || mentions(e.text, id))
}

/**
 * Decisions this animal was part of, narrowed to its own subject.
 *
 * A batch carries up to eight animals; leaving the other seven in would be the
 * opposite of filtering.
 */
export function decisionsFor(
  lines: readonly DecisionLine[], id: string | null,
): DecisionLine[] {
  if (id === null) return [...lines]
  if (!decides(id)) return []
  return lines
    .filter((l) => l.subjects.some((s) => s.agentId === id))
    .map((l) => ({ ...l, subjects: l.subjects.filter((s) => s.agentId === id) }))
}
