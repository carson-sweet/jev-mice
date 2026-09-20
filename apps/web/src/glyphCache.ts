// One image per distinct glyph, drawn once and reused everywhere.
//
// The running log used to draw each line's mark into its own canvas. With four
// hundred lines that is four hundred canvases and four hundred 2D contexts,
// which are native and GPU memory rather than JS heap: the tab died with a
// flat six-megabyte heap and no JavaScript error to point at. The list also
// keyed rows by array index, so trimming the oldest line shifted every index
// and React remounted every row, rebuilding all of those canvases on each
// batch of events.
//
// Drawing to a data URL once and showing it in an <img> keeps drawGlyph as the
// single source of truth for what a glyph looks like -- the map, the key and
// the log still call the same function -- while the number of canvases in the
// document stops depending on how much has happened.

import { drawGlyph, type GlyphKind } from './glyphs'

export interface GlyphCache {
  /** A data URL for this glyph, drawn on first ask and remembered after. */
  url(kind: GlyphKind, size: number, dpr: number, tint?: string): string
  /** How many distinct glyphs are held. Bounded by the glyph set, not by use. */
  size(): number
}

export function createGlyphCache(
  makeCanvas: () => HTMLCanvasElement,
): GlyphCache {
  const urls = new Map<string, string>()

  return {
    url(kind, size, dpr, tint) {
      // Everything that changes the pixels is part of the key. A tint is, so
      // the log's coloured marks do not collide with the map's.
      const key = `${kind}|${size}|${dpr}|${tint ?? ''}`
      const had = urls.get(key)
      if (had !== undefined) return had

      const canvas = makeCanvas()
      canvas.width = Math.max(1, Math.round(size * dpr))
      canvas.height = Math.max(1, Math.round(size * dpr))
      const ctx = canvas.getContext('2d')
      if (!ctx) return ''
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      drawGlyph(ctx, kind, 0, 0, size, tint)

      const made = canvas.toDataURL()
      urls.set(key, made)
      return made
    },
    size() { return urls.size },
  }
}

/**
 * The one cache the application uses. Created lazily so importing this module
 * does not touch the document, which keeps it usable from a test in Node.
 */
let shared: GlyphCache | null = null
export function glyphUrl(
  kind: GlyphKind, size: number, dpr: number, tint?: string,
): string {
  shared ??= createGlyphCache(() => document.createElement('canvas'))
  return shared.url(kind, size, dpr, tint)
}
