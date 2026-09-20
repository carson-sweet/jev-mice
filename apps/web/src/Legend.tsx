// The key to the map. Each swatch is a canvas drawn by the same function the
// grid calls, so a shape here is the shape there by construction rather than by
// somebody remembering to update both.

import { useEffect, useRef } from 'react'
import { drawGlyph, glyphLabel, LEGEND_COLUMNS, type GlyphKind } from './glyphs'
import { useDevicePixelRatio } from './dpr'

const SWATCH = 18

function Swatch({ kind }: { kind: GlyphKind }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  const dpr = useDevicePixelRatio()
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = SWATCH * dpr
    canvas.height = SWATCH * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, SWATCH, SWATCH)
    drawGlyph(ctx, kind, 0, 0, SWATCH)
  }, [kind, dpr])
  return (
    <canvas
      ref={ref}
      style={{ width: SWATCH, height: SWATCH }}
      className="shrink-0"
      aria-hidden="true"
    />
  )
}

export function Legend(): React.ReactElement {
  return (
    <div className="mx-auto mt-3 w-full max-w-3xl shrink-0">
      <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Key</h2>
      {/* One list per column, so a column can be its own length and a family
          is never split across two of them. */}
      <div className="mt-1.5 grid grid-cols-3 gap-x-6">
        {LEGEND_COLUMNS.map((column, i) => (
          <ul key={column[0] ?? String(i)} className="space-y-1">
            {column.map((kind) => (
              <li key={kind} className="flex items-center gap-2 text-xs text-zinc-400">
                <Swatch kind={kind} />
                <span>{glyphLabel(kind)}</span>
              </li>
            ))}
          </ul>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-600">
        Shape carries what a thing is and colour never changes with its
        condition: a hungry animal keeps its own colour and gains a bright dot.
        Mice are blue, cats red, food green, traps orange, and the same shapes
        are used at every world size.
      </p>
    </div>
  )
}
