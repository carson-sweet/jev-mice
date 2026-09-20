// Why this exists: the running log drew each line's mark into its own canvas,
// and the log holds four hundred lines. Canvas backing stores are native and
// GPU memory rather than JS heap, so the tab died with a flat six-megabyte
// heap and no JavaScript error to show for it.
//
// Worse, the list keyed its rows by array index. Slicing the oldest line off
// the front shifted every index, so every key changed and React remounted all
// four hundred rows, destroying and rebuilding four hundred canvases on every
// batch of events.
//
// The property that matters is therefore not what a glyph looks like but how
// many canvases exist: one per distinct glyph, ever, no matter how many rows
// ask for it.

import { describe, it, expect, vi } from 'vitest'
import { createGlyphCache } from '../src/glyphCache.js'

function fakeCanvases() {
  const made: { width: number; height: number; draws: number }[] = []
  const make = vi.fn(() => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        setTransform: () => {}, clearRect: () => {}, beginPath: () => {},
        arc: () => {}, moveTo: () => {}, lineTo: () => {}, closePath: () => {},
        fill: () => { record.draws += 1 }, stroke: () => { record.draws += 1 },
        fillRect: () => { record.draws += 1 },
        fillStyle: '', strokeStyle: '', lineWidth: 0,
      }),
      toDataURL: () => `data:image/png;base64,${made.indexOf(record)}`,
    }
    const record = { width: 0, height: 0, draws: 0 }
    made.push(record)
    return canvas as unknown as HTMLCanvasElement
  })
  return { make, made }
}

describe('Caching the glyph a log line shows', () => {
  it('Draws one glyph once, however many lines ask for it', () => {
    const { make } = fakeCanvases()
    const cache = createGlyphCache(make)
    for (let i = 0; i < 400; i++) cache.url('mouse', 12, 2, '#fff')
    expect(make).toHaveBeenCalledTimes(1)
  })

  it('Hands back the identical string, so the image is never refetched', () => {
    const { make } = fakeCanvases()
    const cache = createGlyphCache(make)
    const first = cache.url('cat', 12, 2, '#f00')
    expect(cache.url('cat', 12, 2, '#f00')).toBe(first)
  })

  it('Keeps different glyphs apart', () => {
    const { make } = fakeCanvases()
    const cache = createGlyphCache(make)
    const a = cache.url('mouse', 12, 2, '#fff')
    const b = cache.url('cat', 12, 2, '#fff')
    expect(a).not.toBe(b)
    expect(make).toHaveBeenCalledTimes(2)
  })

  it('Treats a tint, a size and a pixel ratio as part of what it is', () => {
    const { make } = fakeCanvases()
    const cache = createGlyphCache(make)
    cache.url('mouse', 12, 2, '#fff')
    cache.url('mouse', 12, 2, '#f00')
    cache.url('mouse', 14, 2, '#fff')
    cache.url('mouse', 12, 1, '#fff')
    expect(make).toHaveBeenCalledTimes(4)
  })

  it('Never holds more entries than there are glyphs to hold', () => {
    // The cache is keyed by what a glyph is, not by which row wanted it, so a
    // run of any length cannot grow it.
    const { make } = fakeCanvases()
    const cache = createGlyphCache(make)
    for (let i = 0; i < 10_000; i++) {
      cache.url(i % 2 === 0 ? 'mouse' : 'cat', 12, 2, '#fff')
    }
    expect(cache.size()).toBe(2)
    expect(make).toHaveBeenCalledTimes(2)
  })
})
