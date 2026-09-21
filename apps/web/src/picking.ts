// What a click on the map selects.
//
// Everything on the grid is selectable, and things share cells: a mouse stands
// on a food pile, a trap holds a body, a hole holds a mouse. So a click has to
// resolve a stack.
//
// The order is a judgment rather than an accident. Movers come first, because a
// moving thing is almost always why someone clicked; the fixtures underneath it
// are still one click away once it has moved on.

import type { Frame } from '@jev-mice/sim'
import type { Kind } from './kinds'

/** Searched in this order, first hit wins. */
export const PICK_ORDER: readonly Kind[] = ['cat', 'mouse', 'trap', 'food', 'hole'] as const

export interface Picked { id: string; kind: Kind }

export function pickAt(frame: Frame | null, x: number, y: number): Picked | null {
  if (!frame) return null
  const here = <T extends { id: string; x: number; y: number }>(xs: readonly T[]) =>
    xs.find((t) => t.x === x && t.y === y)

  for (const kind of PICK_ORDER) {
    switch (kind) {
      case 'cat': {
        const hit = here(frame.cats)
        if (hit) return { id: hit.id, kind }
        break
      }
      case 'mouse': {
        // A sheltering mouse is not drawn, so picking it from a click would be
        // selecting something invisible. The hole is what is on screen.
        const hit = here(frame.mice.filter((m) => !m.inHole))
        if (hit) return { id: hit.id, kind }
        break
      }
      case 'trap': {
        const hit = here(frame.traps)
        if (hit) return { id: hit.id, kind }
        break
      }
      case 'food': {
        const hit = here(frame.food)
        if (hit) return { id: hit.id, kind }
        break
      }
      case 'hole': {
        const hit = here(frame.holes)
        if (hit) return { id: hit.id, kind }
        break
      }
    }
  }
  return null
}
