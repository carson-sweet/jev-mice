// Page arithmetic, apart from the component that renders it.
import { describe, it, expect } from 'vitest'
import {
  PAGE_SIZES, DEFAULT_PAGE_SIZE, pageCount, rangeFor, pageContaining, clampPage,
} from '../src/paging.js'

describe('The sizes a page can be', () => {
  it('Offers the usual ladder, and starts at fifty', () => {
    expect(PAGE_SIZES).toEqual([10, 25, 50, 100, 250])
    expect(DEFAULT_PAGE_SIZE).toBe(50)
    expect(PAGE_SIZES).toContain(DEFAULT_PAGE_SIZE)
  })
})

describe('How many pages there are', () => {
  it('Divides the turns by the page size, rounding up', () => {
    expect(pageCount(600, 50)).toBe(12)
    expect(pageCount(601, 50)).toBe(13)
    expect(pageCount(50, 50)).toBe(1)
  })

  it('Is one page even when there is nothing to show', () => {
    // A control reading "page 1 of 0" is nonsense.
    expect(pageCount(0, 50)).toBe(1)
  })
})

describe('Which turns a page covers', () => {
  it('Counts from turn one, not turn zero', () => {
    expect(rangeFor(1, 50, 600)).toEqual({ from: 1, to: 50 })
    expect(rangeFor(2, 50, 600)).toEqual({ from: 51, to: 100 })
  })

  it('Stops the last page at the last turn', () => {
    expect(rangeFor(13, 50, 601)).toEqual({ from: 601, to: 601 })
  })

  it('Never runs past the end, however high the page', () => {
    const r = rangeFor(99, 50, 600)
    expect(r.to).toBeLessThanOrEqual(600)
    expect(r.from).toBeLessThanOrEqual(r.to)
  })

  it('Asks for nothing sensible when there are no turns yet', () => {
    expect(rangeFor(1, 50, 0)).toEqual({ from: 1, to: 1 })
  })
})

describe('Finding the page a turn is on', () => {
  it('Puts the first turns on page one', () => {
    expect(pageContaining(1, 50)).toBe(1)
    expect(pageContaining(50, 50)).toBe(1)
  })

  it('Rolls over on the turn after a page ends', () => {
    expect(pageContaining(51, 50)).toBe(2)
    expect(pageContaining(14_328, 50)).toBe(287)
  })

  it('Keeps a reader in place when the page size changes', () => {
    // Showing turn 101 at fifty a page; at ten a page that turn is on page 11.
    expect(pageContaining(101, 10)).toBe(11)
    expect(pageContaining(101, 250)).toBe(1)
  })

  it('Treats anything before the first turn as the first page', () => {
    expect(pageContaining(0, 50)).toBe(1)
    expect(pageContaining(-5, 50)).toBe(1)
  })
})

describe('Keeping a page number in range', () => {
  it('Holds it between the first and last page', () => {
    expect(clampPage(0, 600, 50)).toBe(1)
    expect(clampPage(99, 600, 50)).toBe(12)
    expect(clampPage(7, 600, 50)).toBe(7)
  })

  it('Rejects anything that is not a page number', () => {
    expect(clampPage(Number.NaN, 600, 50)).toBe(1)
    expect(clampPage(2.7, 600, 50)).toBe(2)
  })
})
