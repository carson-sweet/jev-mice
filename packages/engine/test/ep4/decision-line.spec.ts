// The DECISIONS tab shows what went to Jev and what came back. A subject's full
// state is about a kilobyte, and at twenty flushes a second sending it verbatim
// would be the largest thing on the socket by far, so each subject is reduced to
// one readable line first.
//
// What the line has to keep: enough of the situation that the answer can be
// judged against it. An intent with no situation beside it is unreadable, which
// is the whole reason this tab exists.

import { describe, it, expect } from 'vitest'
import { situationLine } from '../../src/decisions.js'

describe('Summarising what a mouse was asked', () => {
  const state = {
    mouse: { sex: 'female', age: 'a grown adult', hunger: 'hungry',
             personality: 'Cautious: flees early, avoids any place it remembers as dangerous, '
               + 'and prefers to forage near where it has eaten before.',
             condition: 'moving slowly because it is hungry' },
    surroundings: {
      food: 'a food pile nearby to the east',
      cats: 'a cat very close to the north, stalking toward you',
      mice: 'no other mouse worth approaching in sight',
      shelter: 'a free mousehole nearby to the southwest',
      knownTraps: 'no trap you know about nearby',
    },
    memories: ['A cat killed a mouse to the north, a little while ago.'],
  }

  it('Leads with the condition the answer has to be judged against', () => {
    expect(situationLine(state)).toMatch(/^hungry/)
  })

  it('Keeps what is actually present and drops what is not', () => {
    const line = situationLine(state)
    expect(line).toContain('a cat very close to the north')
    expect(line).toContain('a food pile nearby to the east')
    expect(line).toContain('a free mousehole nearby to the southwest')
    // Absences are noise on one line: five "no X in sight" clauses would bury
    // the one thing that matters.
    expect(line).not.toContain('no other mouse')
    expect(line).not.toContain('no trap')
  })

  it('Names the personality in one word, not a paragraph', () => {
    const line = situationLine(state)
    expect(line).toContain('cautious')
    expect(line).not.toContain('flees early')
  })

  it('Stays short enough to read in a list', () => {
    expect(situationLine(state).length).toBeLessThan(200)
  })

  it('Says so plainly when there is nothing around', () => {
    const empty = {
      mouse: { hunger: 'full', personality: 'Bold: approaches food despite nearby danger.' },
      surroundings: {
        food: 'nothing to eat that you can smell', cats: 'no cat in sight',
        mice: 'no other mouse worth approaching in sight',
        shelter: 'no free mousehole in reach', knownTraps: 'no trap you know about nearby',
      },
      memories: [],
    }
    expect(situationLine(empty)).toBe('full, bold, nothing in sight')
  })

  it('Survives a shape it does not recognise', () => {
    // A cat's state has none of these fields, and a malformed one has none
    // either. Neither may throw on the way to a log line.
    expect(situationLine({})).toBe('')
    expect(situationLine(null)).toBe('')
    expect(situationLine({ cat: { doing: 'prowling' } })).toBe('')
  })
})
