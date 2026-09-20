// The fixed rule ladder, tested directly. It runs every animal whenever no key
// is configured and whenever the service fails, and had no test of any decision
// it makes. ISSUE-016 and ISSUE-017.
import { describe, it, expect } from 'vitest'
import {
  baselineDrive, baselineFear, baselineCat, DRIVES,
  type Drive, type MouseContext,
} from '../../src/index.js'

const mouse = (over: Partial<MouseContext> = {}): MouseContext => ({
  id: 'm0001',
  sex: 'female',
  personality: 'bold',
  nutrition: 80,
  age: 100,
  pregnantPastTerm: false,
  movingSlowly: false,
  nearestCat: null,
  nearestFood: null,
  nearestMate: null,
  nearestShelter: null,
  knownTrap: null,
  memories: [],
  options: [...DRIVES],
  ...over,
})

const at = (distance: number) => ({ distance, bearing: 'north', word: 'stalking' })
const shelter = (distance: number) => ({ distance, bearing: 'south' })
const top = (w: Record<string, number>): string =>
  Object.entries(w).reduce((a, b) => (b[1] > a[1] ? b : a))[0]

describe('The rule ladder', () => {
  it('Runs from a cat with no shelter to reach', () => {
    const w = baselineDrive(mouse({ nearestCat: at(2), nearestShelter: shelter(9) }))
    expect(top(w)).toBe('flee')
    expect(w.flee).toBeCloseTo(0.85, 6)
  })

  it('Hides from a cat when shelter is close', () => {
    const w = baselineDrive(mouse({ nearestCat: at(3), nearestShelter: shelter(2) }))
    expect(top(w)).toBe('hide')
    expect(w.hide).toBeCloseTo(0.70, 6)
    expect(w.flee).toBeCloseTo(0.30, 6)
  })

  it('Keeps some weight on running from a cat at middle distance with no shelter', () => {
    // ISSUE-016. Neither the flee row (dCat <= 2) nor the hide row (dHole <= 4)
    // fired here, so flee fell to zero. scoresFor multiplies the danger field
    // by the flee weight, so a zero made the mouse blind to the cat when
    // choosing where to step. This is the path taken whenever Jev is
    // unavailable, which is also the default with no key configured.
    for (const dCat of [3, 4, 5, 6]) {
      for (const dHole of [5, 9, Infinity]) {
        const w = baselineDrive(mouse({
          nutrition: 80,
          nearestCat: at(dCat),
          ...(Number.isFinite(dHole) ? { nearestShelter: shelter(dHole) } : {}),
        }))
        expect(w.flee ?? 0, `cat at ${String(dCat)}, shelter at ${String(dHole)}`)
          .toBeGreaterThan(0)
      }
    }
  })

  it('Leaves a mouse with no cat in sight nothing to run from', () => {
    // A fed mouse with nothing about looks for a mate, which is the ladder
    // working. The point here is that the danger floor stays out of it.
    const w = baselineDrive(mouse({ nutrition: 80 }))
    expect(top(w)).toBe('seek_mate')
    expect(w.flee ?? 0).toBe(0)
  })

  it('Eats above all else when starving', () => {
    const w = baselineDrive(mouse({
      nutrition: 20, nearestFood: { distance: 3, bearing: 'east', suspect: false },
    }))
    expect(top(w)).toBe('eat')
    expect(w.eat).toBeCloseTo(0.90, 6)
  })

  it('Still eats when starving with a cat about, without ignoring the cat', () => {
    const w = baselineDrive(mouse({
      nutrition: 20, nearestCat: at(6),
      nearestFood: { distance: 3, bearing: 'east', suspect: false },
    }))
    expect(top(w)).toBe('eat')
    // The floor takes its share and nothing more: eating still wins by far.
    expect(w.flee).toBeCloseTo(0.2 / 1.2, 6)
    expect(w.eat ?? 0).toBeGreaterThan((w.flee ?? 0) * 3)
  })

  it('Nests when carrying a litter past term', () => {
    const w = baselineDrive(mouse({ pregnantPastTerm: true, nutrition: 80 }))
    expect(top(w)).toBe('nest')
    expect(w.nest).toBeCloseTo(0.80, 6)
  })

  it('Eats less urgently when merely hungry', () => {
    const w = baselineDrive(mouse({ nutrition: 45 }))
    expect(top(w)).toBe('eat')
    expect(w.eat).toBeCloseTo(0.65, 6)
  })

  it('Seeks a mate only when fed and well clear of danger', () => {
    expect(top(baselineDrive(mouse({ nutrition: 80, nearestCat: at(9) })))).toBe('seek_mate')
    // Six cells is not clear enough.
    expect(top(baselineDrive(mouse({ nutrition: 80, nearestCat: at(6) })))).not.toBe('seek_mate')
  })

  it('Always gives weights that sum to one', () => {
    const cases: Partial<MouseContext>[] = [
      { nearestCat: at(1), nearestShelter: shelter(9) },
      { nearestCat: at(3), nearestShelter: shelter(2) },
      { nutrition: 10 },
      { pregnantPastTerm: true },
      { nutrition: 50 },
      { nutrition: 90 },
      { options: ['explore'] },
    ]
    for (const over of cases) {
      const w = baselineDrive(mouse(over))
      const total = Object.values(w).reduce((a, b) => a + b, 0)
      expect(total, JSON.stringify(over)).toBeCloseTo(1, 6)
    }
  })

  it('Never offers a drive that was not on the table', () => {
    const only: Drive[] = ['explore', 'eat']
    const w = baselineDrive(mouse({ options: only, nearestCat: at(1) }))
    expect(Object.keys(w).sort()).toEqual([...only].sort())
  })
})

describe('The fear rule', () => {
  it('Reads straight off the distance to the nearest cat', () => {
    expect(baselineFear(mouse({ nearestCat: at(0) }), 0)).toBe('panicked')
    expect(baselineFear(mouse({ nearestCat: at(1) }), 0)).toBe('panicked')
    expect(baselineFear(mouse({ nearestCat: at(2) }), 0)).toBe('alarmed')
    expect(baselineFear(mouse({ nearestCat: at(4) }), 0)).toBe('alarmed')
    expect(baselineFear(mouse({ nearestCat: at(5) }), 0)).toBe('wary')
    expect(baselineFear(mouse({ nearestCat: at(8) }), 0)).toBe('wary')
  })

  it('Stays wary on a fresh memory with no cat in sight', () => {
    const remembered = mouse({
      memories: [{ kind: 'death_in_trap', at: { x: 1, y: 1 }, addedAt: 50,
                   provenance: 'seen', sentence: 'a mouse died here' } as never],
    })
    expect(baselineFear(remembered, 60)).toBe('wary')
    // The same memory, long past.
    expect(baselineFear(remembered, 400)).toBe('unconcerned')
  })

  it('Ignores its own narrow escape when nothing is in sight', () => {
    const escaped = mouse({
      memories: [{ kind: 'narrow_escape', at: { x: 1, y: 1 }, addedAt: 50,
                   provenance: 'seen', sentence: 'that was close' } as never],
    })
    expect(baselineFear(escaped, 60)).toBe('unconcerned')
  })
})

describe('The cat rule', () => {
  it('Prefers a slow mouse a little further off to a healthy one underfoot', () => {
    const { target } = baselineCat({
      at: { x: 0, y: 0 },
      mode: 'prowl',
      candidates: [
        { id: 'm0001', distance: 1, nutrition: 100 },
        { id: 'm0002', distance: 3, nutrition: 10 },
      ],
    })
    // 1 + 100/20 = 6 against 3 + 10/20 = 3.5.
    expect(target).toBe('m0002')
  })

  it('Springs when close and stalks when not', () => {
    const near = baselineCat({ at: { x: 0, y: 0 }, mode: 'prowl',
      candidates: [{ id: 'm0001', distance: 2, nutrition: 50 }] })
    expect(near.mode).toBe('pounce')
    const far = baselineCat({ at: { x: 0, y: 0 }, mode: 'prowl',
      candidates: [{ id: 'm0001', distance: 7, nutrition: 50 }] })
    expect(far.mode).toBe('stalk')
  })

  it('Chases nothing when there is nothing to chase', () => {
    const empty = baselineCat({ at: { x: 0, y: 0 }, mode: 'prowl', candidates: [] })
    expect(empty).toEqual({ target: 'none_worth_it', mode: 'prowl' })
  })
})
