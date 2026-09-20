// The key to the map. Each swatch is a canvas drawn by the same function the
// grid calls, so a shape here is the shape there by construction rather than by
// somebody remembering to update both.

import { useEffect, useRef } from 'react'
import { catShade, drawGlyph, glyphLabel, mouseShade, type GlyphKind } from './glyphs'

const SWATCH = 18

function Swatch({ kind }: { kind: GlyphKind }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = SWATCH * dpr
    canvas.height = SWATCH * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, SWATCH, SWATCH)
    const shade = kind === 'mouse' ? mouseShade(100)
      : kind === 'mouseFaint' ? mouseShade(10)
      : kind === 'cat' ? catShade(100)
      : kind === 'catHungry' ? catShade(20)
      : undefined
    drawGlyph(ctx, kind, 0, 0, SWATCH, shade)
  }, [kind])
  return (
    <canvas
      ref={ref}
      style={{ width: SWATCH, height: SWATCH }}
      className="shrink-0"
      aria-hidden="true"
    />
  )
}

const ROWS: readonly GlyphKind[][] = [
  ['mouse', 'mouseFaint'],
  ['cat', 'catHungry'],
  ['food', 'trap'],
  ['trapOccupied', 'hole'],
  ['holeOccupied'],
] as const

export function Legend(): React.ReactElement {
  return (
    <div className="mx-auto mt-3 w-full max-w-3xl shrink-0">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Key</h2>
      <ul className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
        {ROWS.flat().map((kind) => (
          <li key={kind} className="flex items-center gap-2 text-xs text-zinc-400">
            <Swatch kind={kind} />
            <span>{glyphLabel(kind)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-zinc-600">
        Shape carries what a thing is and shade carries its condition, so the map
        still reads without relying on colour. Mice are blue, cats red, food
        green, traps orange, and the same shapes are used at every world size.
      </p>
    </div>
  )
}
