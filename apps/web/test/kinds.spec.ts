// What a thing is, from its id alone.
//
// The engine prefixes every id by kind, so nothing has to search the frame to
// know what it is looking at -- which matters for the log, where an id appears
// in a sentence with no other context.

import { describe, it, expect } from 'vitest'
import { kindOf, KIND_LABEL } from '../src/kinds.js'

describe('Reading a kind off an id', () => {
  it('Knows each of the five', () => {
    expect(kindOf('m0001')).toBe('mouse')
    expect(kindOf('c0002')).toBe('cat')
    expect(kindOf('t0003')).toBe('trap')
    expect(kindOf('f0004')).toBe('food')
    expect(kindOf('h0005')).toBe('hole')
  })

  it('Says nothing rather than guessing at something it does not know', () => {
    expect(kindOf('x0001')).toBeNull()
    expect(kindOf('')).toBeNull()
    expect(kindOf('mouse')).toBeNull()
  })

  it('Has a readable name for every kind it can return', () => {
    for (const id of ['m0001', 'c0001', 't0001', 'f0001', 'h0001']) {
      const kind = kindOf(id)
      expect(kind).not.toBeNull()
      expect(KIND_LABEL[kind!]).toBeTruthy()
    }
  })
})
