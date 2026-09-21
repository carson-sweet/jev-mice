// The key to the map. Each swatch is a canvas drawn by the same function the
// grid calls, so a shape here is the shape there by construction rather than by
// somebody remembering to update both.

import { useEffect, useRef } from 'react'
import { drawGlyph, glyphLabel, LEGEND_ROWS, type GlyphKind } from './glyphs'
import { useDevicePixelRatio } from './dpr'

const SWATCH = 16

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
    <div className="mt-3 shrink-0">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
          Key
        </h2>
        {/* The rule the key follows, as a title rather than a paragraph. Four
            lines of prose under the map cost the map four lines of height, and
            anyone who wants the rule can hover the word it belongs to. */}
        <span
          className="cursor-help text-[10px] text-zinc-700 underline decoration-dotted"
          title={'Shape carries what a thing is and colour never changes with its condition: '
            + 'a hungry animal keeps its own colour and gains a bright dot, and an infected '
            + 'one gains a purple ring. Mice are blue, cats red, food green, traps orange, '
            + 'and the same shapes are used at every world size.'}
        >
          how to read it
        </span>
      </div>
      {/* Four columns rather than three. Twelve glyphs in three columns is four
          rows deep; in four it is three, and the map keeps the difference. */}
      <div className="mt-1.5 grid grid-cols-2 gap-x-5 gap-y-0.5 sm:grid-cols-3 xl:grid-cols-4">
        {LEGEND_ROWS.flat().map((kind) => (
          <div key={kind} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Swatch kind={kind} />
            <span className="truncate">{glyphLabel(kind)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
