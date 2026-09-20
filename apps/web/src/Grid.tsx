// The world, drawn on a canvas. Nothing here decides anything; it renders the
// last frame the server sent and reports what was clicked. Every shape comes
// from the shared glyph set, which is what the legend draws from too.

import { useEffect, useReducer, useRef, useState } from 'react'
import type { Frame } from '@jev-mice/sim'
import { COLOURS, drawGlyph, glyphLabel, type GlyphKind } from './glyphs'
import { useDevicePixelRatio } from './dpr'

/** What sits on one cell, named by the key rather than by a second wording. */
export interface Identified { id: string; kind: GlyphKind; detail: string }

export function Grid({ frame, width, height, selected, highlighted, onSelect }: {
  frame: Frame | null
  width: number
  height: number
  selected: string | null
  /** Ids to ring, so hovering a log line points at what it is about. */
  highlighted?: readonly string[]
  onSelect: (id: string | null) => void
}): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  // Measured instead of the canvas's own parent: a wrapper that hugs the canvas
  // is sized by it, and measuring that makes the map shrink to nothing.
  const box = useRef<HTMLDivElement>(null)
  const cell = useRef(8)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [hover, setHover] = useState<{ x: number; y: number; what: Identified } | null>(null)
  const dpr = useDevicePixelRatio()

  /** Animals first: a cell with a mouse on a hole is about the mouse. */
  const identify = (fx: number, fy: number): Identified | null => {
    if (!frame) return null
    const cat = frame.cats.find((c) => c.x === fx && c.y === fy)
    if (cat) {
      return { id: cat.id, kind: cat.hungry ? 'catHungry' : 'cat',
               detail: `${cat.id}, ${cat.mode}, ${String(cat.nutrition)} percent` }
    }
    const mouse = frame.mice.find((m) => !m.inHole && m.x === fx && m.y === fy)
    if (mouse) {
      return { id: mouse.id, kind: mouse.hungry ? 'mouseHungry' : 'mouse',
               detail: `${mouse.id}, ${mouse.intent ?? 'deciding'}, `
                 + `${String(mouse.nutrition)} percent, ${mouse.fear}` }
    }
    const trap = frame.traps.find((x) => x.x === fx && x.y === fy)
    if (trap) {
      return { id: trap.id, kind: trap.occupied ? 'trapOccupied' : 'trap', detail: trap.id }
    }
    const food = frame.food.find((f) => f.x === fx && f.y === fy)
    if (food) return { id: food.id, kind: 'food', detail: food.id }
    const hole = frame.holes.find((h) => h.x === fx && h.y === fy)
    if (hole) {
      return {
        id: hole.id,
        kind: hole.occupancy === 'empty' ? 'hole'
          : hole.occupancy === 'brood' ? 'holeBrood' : 'holeAdult',
        detail: hole.id,
      }
    }
    return null
  }

  // A paused or finished run sends no more frames, so without this the map
  // would keep whatever size the window had when the last one arrived.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(() => { bump() })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const available = box.current?.getBoundingClientRect()
    const avail = available === undefined || available.width < 40
      ? { width: 800, height: 600 }
      : available
    const size = Math.max(3, Math.floor(Math.min(avail.width / width, avail.height / height)))
    cell.current = size
    canvas.width = width * size * dpr
    canvas.height = height * size * dpr
    canvas.style.width = `${String(width * size)}px`
    canvas.style.height = `${String(height * size)}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = COLOURS.background
    ctx.fillRect(0, 0, width * size, height * size)

    if (size >= 6) {
      ctx.strokeStyle = COLOURS.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= width; x++) { ctx.moveTo(x * size, 0); ctx.lineTo(x * size, height * size) }
      for (let y = 0; y <= height; y++) { ctx.moveTo(0, y * size); ctx.lineTo(width * size, y * size) }
      ctx.stroke()
    }
    if (!frame) return

    // Terrain first, animals last, so nothing standing on a hole is hidden.
    for (const h of frame.holes) {
      drawGlyph(ctx, h.occupancy === 'empty' ? 'hole'
        : h.occupancy === 'brood' ? 'holeBrood' : 'holeAdult',
                h.x * size, h.y * size, size)
    }
    for (const f of frame.food) drawGlyph(ctx, 'food', f.x * size, f.y * size, size)
    for (const t of frame.traps) {
      drawGlyph(ctx, t.occupied ? 'trapOccupied' : 'trap', t.x * size, t.y * size, size)
    }
    for (const m of frame.mice) {
      if (m.inHole) continue
      drawGlyph(ctx, m.hungry ? 'mouseHungry' : 'mouse', m.x * size, m.y * size, size)
      if (m.id === selected) {
        ctx.strokeStyle = COLOURS.selected
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(m.x * size + size / 2, m.y * size + size / 2, Math.max(2, size / 2), 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    for (const c of frame.cats) {
      drawGlyph(ctx, c.hungry ? 'catHungry' : 'cat', c.x * size, c.y * size, size)
    }

    // Anything a hovered log line is about, ringed where it still stands.
    const ring = new Set(highlighted ?? [])
    if (ring.size > 0) {
      ctx.strokeStyle = COLOURS.selected
      ctx.lineWidth = 2
      const at: { x: number; y: number }[] = [
        ...frame.mice.filter((m) => !m.inHole && ring.has(m.id)),
        ...frame.cats.filter((c) => ring.has(c.id)),
        ...frame.traps.filter((x) => ring.has(x.id)),
        ...frame.food.filter((f) => ring.has(f.id)),
        ...frame.holes.filter((h) => ring.has(h.id)),
      ]
      for (const p of at) {
        ctx.beginPath()
        ctx.arc(p.x * size + size / 2, p.y * size + size / 2,
                Math.max(3, size / 2 + 2), 0, Math.PI * 2)
        ctx.stroke()
      }
    }
  }, [frame, width, height, selected, highlighted, dpr])

  const cellAt = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.floor((e.clientX - rect.left) / cell.current),
      y: Math.floor((e.clientY - rect.top) / cell.current),
    }
  }

  return (
    <div ref={box} className="flex h-full w-full items-center justify-center">
      {/* Hugs the canvas so the tooltip can be positioned against its cells. */}
      <div className="relative">
      <canvas
        ref={ref}
        className="rounded border border-zinc-800"
        aria-label={frame
          ? `World at tick ${String(frame.tick)} with ${String(frame.mice.length)} mice`
          : 'World, no frame yet'}
        onMouseMove={(e) => {
          const { x, y } = cellAt(e)
          const what = identify(x, y)
          setHover(what === null ? null : { x: x * cell.current, y: y * cell.current, what })
        }}
        onMouseLeave={() => { setHover(null) }}
        onClick={(e) => {
          const { x, y } = cellAt(e)
          const hit = frame?.mice.find((m) => !m.inHole && m.x === x && m.y === y)
          onSelect(hit?.id ?? null)
        }}
      />
      {hover !== null && (
        <div
          role="tooltip"
          // Follows the cell, not the pointer, so it does not jitter, and it is
          // never wide enough to cover what is being pointed at.
          style={{ left: hover.x + cell.current + 6, top: Math.max(0, hover.y - 4) }}
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded border
                     border-zinc-700 bg-zinc-900/95 px-1.5 py-1 text-[11px]
                     leading-tight text-zinc-200 shadow-lg"
        >
          <span className="font-medium">{glyphLabel(hover.what.kind)}</span>
          <span className="block text-zinc-500">{hover.what.detail}</span>
        </div>
      )}
      </div>
    </div>
  )
}
