// The bottom panel's tabs.
//
// Kept apart from the component so the choice of which one opens can be tested
// without a DOM, and so the labels live in one place rather than in markup.

export type TabId = 'ecosystem' | 'decisions' | 'history'

export const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'ecosystem', label: 'ECOSYSTEM' },
  { id: 'decisions', label: 'DECISIONS' },
  { id: 'history', label: 'HISTORY' },
] as const

/**
 * Which tab to open on. With nothing being watched there is no log and no
 * decisions, so the list of previous runs is the only one with anything to say.
 */
export function initialTab(o: { watching: boolean }): TabId {
  return o.watching ? 'ecosystem' : 'history'
}
