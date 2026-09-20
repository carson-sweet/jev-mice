// Every shape drawn on the grid, in one place, so the legend and the map cannot
// drift apart. Both call drawGlyph; the legend simply passes a fixed size.
//
// Four solid shapes carry the four things that matter, because a stroke thins
// to nothing as cells shrink and a colour alone is not enough to tell two
// things apart. Circle, triangle, square and diamond stay distinct down to a
// few pixels, which is what makes the same glyph work on every preset.

export type GlyphKind =
  | 'mouse' | 'mouseFaint' | 'cat' | 'catHungry'
  | 'food' | 'trap' | 'trapOccupied' | 'hole' | 'holeOccupied'

export const COLOURS = {
  mouse: '#3b82f6',
  mouseFaint: '#93c5fd',
  cat: '#ef4444',
  catHungry: '#b91c1c',
  food: '#22c55e',
  trap: '#f97316',
  trapOccupied: '#9a3412',
  hole: '#64748b',
  holeOccupied: '#cbd5e1',
  background: '#0b0d10',
  grid: '#151a21',
  selected: '#facc15',
} as const

/** Mice stay blue and cats stay red; condition moves the shade, never the hue. */
export function mouseShade(nutrition: number): string {
  const t = Math.max(0, Math.min(100, nutrition)) / 100
  const r = Math.round(147 - 88 * t)
  const g = Math.round(197 - 67 * t)
  const b = Math.round(253 - 7 * t)
  return `rgb(${String(r)},${String(g)},${String(b)})`
}

export function catShade(nutrition: number): string {
  const t = Math.max(0, Math.min(100, nutrition)) / 100
  const r = Math.round(185 + 54 * t)
  const g = Math.round(28 + 40 * t)
  const b = Math.round(28 + 40 * t)
  return `rgb(${String(r)},${String(g)},${String(b)})`
}

const LABELS: Record<GlyphKind, string> = {
  mouse: 'Mouse',
  mouseFaint: 'Mouse, close to starving',
  cat: 'Cat',
  catHungry: 'Cat, hungry and hunting harder',
  food: 'Food pile',
  trap: 'Trap',
  trapOccupied: 'Trap holding a dead mouse',
  hole: 'Mousehole, free',
  holeOccupied: 'Mousehole, in use',
}

export const glyphLabel = (kind: GlyphKind): string => LABELS[kind]

/**
 * Draws one glyph centred in the cell whose top-left corner is (px, py).
 * `size` is the cell edge in CSS pixels. Everything scales from it, with a
 * floor so nothing disappears on the large preset.
 */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  kind: GlyphKind,
  px: number,
  py: number,
  size: number,
  colour?: string,
): void {
  const cx = px + size / 2
  const cy = py + size / 2
  // A shared radius keeps a triangle from looking larger than a circle beside it.
  const r = Math.max(1.5, size / 2 - Math.max(0.5, size * 0.1))
  ctx.fillStyle = colour ?? COLOURS[kind]
  ctx.strokeStyle = colour ?? COLOURS[kind]

  switch (kind) {
    case 'mouse':
    case 'mouseFaint': {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      return
    }
    case 'cat':
    case 'catHungry': {
      // Slightly taller than wide so it reads as a head, not a wedge.
      ctx.beginPath()
      ctx.moveTo(cx, cy - r * 1.05)
      ctx.lineTo(cx + r, cy + r * 0.85)
      ctx.lineTo(cx - r, cy + r * 0.85)
      ctx.closePath()
      ctx.fill()
      return
    }
    case 'food': {
      const s = r * 1.7
      ctx.fillRect(cx - s / 2, cy - s / 2, s, s)
      return
    }
    case 'trap':
    case 'trapOccupied': {
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fill()
      if (kind === 'trapOccupied') {
        // The mouse that died in it, so a loss is visible on the map.
        ctx.fillStyle = COLOURS.mouseFaint
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(1, r * 0.38), 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }
    case 'hole':
    case 'holeOccupied': {
      const w = Math.max(1, size * 0.16)
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(1, r - w / 2), 0, Math.PI * 2)
      ctx.stroke()
      if (kind === 'holeOccupied') {
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(0.75, r * 0.34), 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }
  }
}

/** Drawn under everything else, so an animal standing on a hole is still visible. */
export const GLYPH_ORDER: readonly GlyphKind[] = [
  'hole', 'holeOccupied', 'food', 'trap', 'trapOccupied', 'mouse', 'cat',
] as const
