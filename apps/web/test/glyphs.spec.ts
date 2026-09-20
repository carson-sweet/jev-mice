// The legend has to name every glyph the map can draw, or the key is a lie.
// This is the test that keeps it honest when a glyph is added.
import { describe, it, expect } from 'vitest'
import { GLYPH_KINDS, LEGEND_COLUMNS, glyphLabel, COLOURS } from '../src/glyphs.js'

describe('The glyph set', () => {
  it('Is named in the legend exactly once each, with nothing left out', () => {
    const listed = LEGEND_COLUMNS.flat()
    expect([...listed].sort()).toEqual([...GLYPH_KINDS].sort())
    expect(new Set(listed).size).toBe(listed.length)
  })

  it('Reads down three columns in the order the key is laid out', () => {
    expect(LEGEND_COLUMNS).toEqual([
      ['mouse', 'mouseHungry', 'food'],
      ['cat', 'catHungry', 'trap'],
      ['trapOccupied', 'hole', 'holeAdult', 'holeBrood'],
    ])
  })

  it('Keeps a family together in its own column, whatever length that is', () => {
    // The three mousehole states belong beside each other, so the third column
    // is longer rather than a state being pushed into a column of cats.
    const holes = GLYPH_KINDS.filter((k) => k.startsWith('hole'))
    const third = LEGEND_COLUMNS[2] ?? []
    for (const h of holes) expect(third).toContain(h)
  })

  it('Tells a sheltering adult from a litter', () => {
    expect(GLYPH_KINDS).toContain('holeAdult')
    expect(GLYPH_KINDS).toContain('holeBrood')
    expect(glyphLabel('holeAdult')).not.toBe(glyphLabel('holeBrood'))
    // Both say what is in the hole, not merely that something is.
    expect(glyphLabel('holeAdult').toLowerCase()).toContain('adult')
    expect(glyphLabel('holeBrood').toLowerCase()).toContain('litter')
  })

  it('Gives every glyph a label', () => {
    for (const kind of GLYPH_KINDS) {
      expect(glyphLabel(kind).length, kind).toBeGreaterThan(0)
    }
  })
})

describe('Colour says what a thing is, not how it is doing', () => {
  it('Draws a hungry mouse in the same blue as any other mouse', () => {
    expect(COLOURS.mouseHungry).toBe(COLOURS.mouse)
  })

  it('Draws a hungry cat in the same red as any other cat', () => {
    expect(COLOURS.catHungry).toBe(COLOURS.cat)
  })

  it('Marks hunger with one bright colour, used for nothing else', () => {
    expect(COLOURS.hungry).toBeDefined()
    expect(COLOURS.hungry).not.toBe(COLOURS.mouse)
    expect(COLOURS.hungry).not.toBe(COLOURS.cat)
    expect(COLOURS.hungry).not.toBe(COLOURS.food)
    expect(COLOURS.hungry).not.toBe(COLOURS.trap)
  })
})
