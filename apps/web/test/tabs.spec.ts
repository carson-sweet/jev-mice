// Which tab is showing, kept out of the component so it can be tested without
// a DOM. The rule that matters: a tab that cannot say anything yet should not
// be the one on screen.

import { describe, it, expect } from 'vitest'
import { TABS, initialTab, type TabId } from '../src/tabs.js'

describe('The bottom panel tabs', () => {
  it('Reads left to right in the order they were asked for', () => {
    expect(TABS.map((t) => t.id)).toEqual(['ecosystem', 'decisions', 'history'])
  })

  it('Labels them in capitals, as named', () => {
    expect(TABS.map((t) => t.label)).toEqual(['ECOSYSTEM', 'DECISIONS', 'HISTORY'])
  })

  it('Opens on the ecosystem once a run is being watched', () => {
    expect(initialTab({ watching: true })).toBe('ecosystem')
  })

  it('Opens on the history when nothing is being watched', () => {
    // With no run there is no log and no decisions, so the only tab with
    // anything in it is the list of previous runs.
    expect(initialTab({ watching: false })).toBe('history')
  })

  it('Names every tab the panel can show', () => {
    const ids: TabId[] = ['ecosystem', 'decisions', 'history']
    expect(new Set(TABS.map((t) => t.id))).toEqual(new Set(ids))
  })
})
