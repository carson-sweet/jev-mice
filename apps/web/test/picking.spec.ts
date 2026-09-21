// What a click on the map selects.
//
// Everything on the grid is selectable, not only mice, and things share cells:
// a mouse stands on a food pile, a trap holds a body, a hole holds a mouse. So
// a click has to resolve a stack, and the order is a judgment: the movers come
// first, because a moving thing is why someone clicked. A mouse inside a hole is
// not drawn at all, so clicking there selects the hole rather than something
// invisible.

import { describe, it, expect } from 'vitest'
import { pickAt, PICK_ORDER } from '../src/picking.js'
import { kindOf } from '../src/kinds.js'
import type { Frame } from '@jev-mice/sim'

const frame = (over: Partial<Frame> = {}): Frame => ({
  tick: 1, population: 1,
  mice: [], cats: [], food: [], traps: [], holes: [],
  ...over,
})

const mouse = (id: string, x: number, y: number, inHole = false) =>
  ({ id, x, y, nutrition: 80, intent: 'eat', fear: 'wary', inHole, hungry: false,
     infected: false })
const cat = (id: string, x: number, y: number) =>
  ({ id, x, y, mode: 'prowl', nutrition: 90, hungry: false, shedding: false })

describe('Picking something off the map', () => {
  it('Picks a mouse', () => {
    const f = frame({ mice: [mouse('m0001', 3, 4)] })
    expect(pickAt(f, 3, 4)).toEqual({ id: 'm0001', kind: 'mouse' })
  })

  it('Picks a cat, a trap, a food pile and a mousehole', () => {
    expect(pickAt(frame({ cats: [cat('c0001', 1, 1)] }), 1, 1))
      .toEqual({ id: 'c0001', kind: 'cat' })
    expect(pickAt(frame({ traps: [{ id: 't0001', x: 2, y: 2, occupied: false }] }), 2, 2))
      .toEqual({ id: 't0001', kind: 'trap' })
    expect(pickAt(frame({ food: [{ id: 'f0001', x: 3, y: 3 }] }), 3, 3))
      .toEqual({ id: 'f0001', kind: 'food' })
    expect(pickAt(frame({ holes: [{ id: 'h0001', x: 4, y: 4, occupancy: 'empty' }] }), 4, 4))
      .toEqual({ id: 'h0001', kind: 'hole' })
  })

  it('Resolves a stack by what moves, not by what was declared first', () => {
    const f = frame({
      food: [{ id: 'f0001', x: 5, y: 5 }],
      mice: [mouse('m0001', 5, 5)],
      cats: [cat('c0001', 5, 5)],
      traps: [{ id: 't0001', x: 5, y: 5, occupied: false }],
    })
    expect(pickAt(f, 5, 5)?.id).toBe('c0001')
  })

  it('Prefers a mouse to the ground it stands on', () => {
    const f = frame({ food: [{ id: 'f0001', x: 6, y: 6 }], mice: [mouse('m0001', 6, 6)] })
    expect(pickAt(f, 6, 6)?.id).toBe('m0001')
  })

  it('Picks the hole, not the mouse hidden in it', () => {
    // A sheltering mouse is not drawn, so selecting it from a click would be
    // selecting something invisible.
    const f = frame({
      mice: [mouse('m0001', 7, 7, true)],
      holes: [{ id: 'h0001', x: 7, y: 7, occupancy: 'adult' }],
    })
    expect(pickAt(f, 7, 7)).toEqual({ id: 'h0001', kind: 'hole' })
  })

  it('Returns nothing for an empty cell', () => {
    expect(pickAt(frame({ mice: [mouse('m0001', 1, 1)] }), 9, 9)).toBeNull()
  })

  it('Returns nothing when there is no frame at all', () => {
    expect(pickAt(null, 1, 1)).toBeNull()
  })

  it('Orders the kinds it searches, so the order is reviewable', () => {
    expect(PICK_ORDER).toEqual(['cat', 'mouse', 'trap', 'food', 'hole'])
  })

  it('Agrees with what the id says it is', () => {
    // The two have to agree or the inspector renders the wrong panel.
    const f = frame({ cats: [cat('c0001', 1, 1)] })
    const hit = pickAt(f, 1, 1)
    expect(kindOf(hit!.id)).toBe(hit!.kind)
  })
})
