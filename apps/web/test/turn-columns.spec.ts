// One list drives the headers and the cells, so a header can never end up over
// the wrong number.
import { describe, it, expect } from 'vitest'
import { TURN_COLUMNS, EXPANSION_INDENT } from '../src/turnColumns.js'

describe('The turn table columns', () => {
  it('Puts what happened immediately right of the turn number', () => {
    expect(TURN_COLUMNS.map((c) => c.head))
      .toEqual(['Turn', 'What happened', 'Mice', 'Cats', 'Food', 'Traps'])
  })

  it('Names every column it renders, with no gaps', () => {
    for (const column of TURN_COLUMNS) {
      expect(column.head.length).toBeGreaterThan(0)
      expect(typeof column.key).toBe('string')
    }
    const keys = TURN_COLUMNS.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('Indents an opened turn to the start of what happened', () => {
    // One empty cell for the turn number, then the rest spanned, so the events
    // begin exactly where the column above them begins.
    expect(EXPANSION_INDENT).toBe(1)
    expect(EXPANSION_INDENT + (TURN_COLUMNS.length - EXPANSION_INDENT))
      .toBe(TURN_COLUMNS.length)
    expect(TURN_COLUMNS[EXPANSION_INDENT]?.head).toBe('What happened')
  })
})
