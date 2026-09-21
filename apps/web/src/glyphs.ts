// Every shape drawn on the grid, in one place, so the legend and the map cannot
// drift apart. Both call drawGlyph; the legend simply passes a fixed size.
//
// Four solid shapes carry the four things that matter, because a stroke thins
// to nothing as cells shrink and a colour alone is not enough to tell two
// things apart. Circle, triangle, square and diamond stay distinct down to a
// few pixels, which is what makes the same glyph work on every preset.
//
// Colour says what a thing is and never how it is doing. A shade ramp for
// nutrition looked like a different animal at a glance; hunger is one bright
// dot in the middle instead, the same dot on a mouse and on a cat.

export type GlyphKind =
  | 'mouse' | 'mouseHungry' | 'mouseInfected' | 'food'
  | 'cat' | 'catHungry' | 'catShedding' | 'trap'
  | 'trapOccupied' | 'hole' | 'holeAdult' | 'holeBrood'

/** Every glyph the map can draw. The legend is tested against this. */
export const GLYPH_KINDS: readonly GlyphKind[] = [
  'mouse', 'mouseHungry', 'mouseInfected', 'food',
  'cat', 'catHungry', 'catShedding', 'trap',
  'trapOccupied', 'hole', 'holeAdult', 'holeBrood',
] as const

/**
 * One row per family, read across. A mouse and its conditions sit together, the
 * cats below them, the fixed things below that, so infection reads as another
 * state of an animal rather than as a separate creature.
 */
export const LEGEND_ROWS: readonly (readonly GlyphKind[])[] = [
  ['mouse', 'mouseHungry', 'mouseInfected', 'food'],
  ['cat', 'catHungry', 'catShedding', 'trap'],
  ['trapOccupied', 'hole', 'holeAdult', 'holeBrood'],
] as const

export const COLOURS = {
  mouse: '#3b82f6',
  mouseHungry: '#3b82f6',
  mouseInfected: '#3b82f6',
  cat: '#ef4444',
  catHungry: '#ef4444',
  catShedding: '#ef4444',
  food: '#22c55e',
  trap: '#f97316',
  trapOccupied: '#9a3412',
  hole: '#64748b',
  holeAdult: '#94a3b8',
  holeBrood: '#94a3b8',
  /** Hunger, on either animal. Used for nothing else. */
  hungry: '#fde047',
  /** Toxoplasmosis, on either animal. Used for nothing else. */
  infected: '#a855f7',
  background: '#0b0d10',
  grid: '#151a21',
  selected: '#facc15',
} as const

const LABELS: Record<GlyphKind, string> = {
  mouse: 'Mouse',
  mouseHungry: 'Hungry mouse',
  mouseInfected: 'Mouse with toxoplasmosis',
  cat: 'Cat',
  catHungry: 'Hungry cat',
  catShedding: 'Cat spreading toxoplasmosis',
  food: 'Food pile',
  trap: 'Trap',
  trapOccupied: 'Trap with a dead mouse',
  hole: 'Mousehole, available',
  holeAdult: 'Mousehole, adult sheltering',
  holeBrood: 'Mousehole, litter inside',
}

export const glyphLabel = (kind: GlyphKind): string => LABELS[kind]

/**
 * The mark for toxoplasmosis: a ring around the outside.
 *
 * A ring rather than a dot because the centre is already hunger's, and an
 * animal can be both. Infection is the outline, hunger is the middle, and the
 * two read together without a glyph for every combination.
 */
export function drawInfectionRing(
  ctx: CanvasRenderingContext2D, px: number, py: number, size: number,
): void {
  const r = Math.max(1.5, size / 2 - Math.max(0.5, size * 0.1))
  ctx.strokeStyle = COLOURS.infected
  ctx.lineWidth = Math.max(1, size * 0.14)
  ctx.beginPath()
  ctx.arc(px + size / 2, py + size / 2, Math.max(1, r - ctx.lineWidth / 2), 0, Math.PI * 2)
  ctx.stroke()
}

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

  /** One bright dot in the middle, the same on either animal. */
  const hungerDot = (): void => {
    ctx.fillStyle = COLOURS.hungry
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(1, r * 0.42), 0, Math.PI * 2)
    ctx.fill()
  }

  switch (kind) {
    case 'mouse':
    case 'mouseHungry':
    case 'mouseInfected': {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      if (kind === 'mouseHungry') hungerDot()
      if (kind === 'mouseInfected') drawInfectionRing(ctx, px, py, size)
      return
    }
    case 'cat':
    case 'catHungry':
    case 'catShedding': {
      // Slightly taller than wide so it reads as a head, not a wedge.
      ctx.beginPath()
      ctx.moveTo(cx, cy - r * 1.05)
      ctx.lineTo(cx + r, cy + r * 0.85)
      ctx.lineTo(cx - r, cy + r * 0.85)
      ctx.closePath()
      ctx.fill()
      // Sits a little low, because a triangle's visual centre is below its
      // middle and a centred dot reads as high.
      if (kind === 'catHungry') {
        ctx.fillStyle = COLOURS.hungry
        ctx.beginPath()
        ctx.arc(cx, cy + r * 0.2, Math.max(1, r * 0.34), 0, Math.PI * 2)
        ctx.fill()
      }
      // A shedding cat is marked the same purple, but as a dot: a triangle has
      // no outline a ring could follow at this size.
      if (kind === 'catShedding') {
        ctx.fillStyle = COLOURS.infected
        ctx.beginPath()
        ctx.arc(cx, cy + r * 0.2, Math.max(1, r * 0.34), 0, Math.PI * 2)
        ctx.fill()
      }
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
        ctx.fillStyle = COLOURS.mouse
        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(1, r * 0.38), 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }
    case 'hole':
    case 'holeAdult':
    case 'holeBrood': {
      const w = Math.max(1, size * 0.16)
      ctx.lineWidth = w
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(1, r - w / 2), 0, Math.PI * 2)
      ctx.stroke()
      if (kind === 'hole') return
      // What is inside is drawn in the mouse's own blue, as the dead mouse in a
      // trap is. One small dot is one adult; a disc filling the hole is a
      // litter. Density rather than a second shape, because a ring's interior
      // is a few pixels across on the large preset and two shapes in there
      // would be indistinguishable.
      ctx.fillStyle = COLOURS.mouse
      ctx.beginPath()
      ctx.arc(cx, cy, kind === 'holeBrood'
        ? Math.max(1.25, r * 0.62)
        : Math.max(0.75, r * 0.3), 0, Math.PI * 2)
      ctx.fill()
      return
    }
  }
}


