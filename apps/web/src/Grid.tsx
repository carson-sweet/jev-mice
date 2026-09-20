// The world, drawn on a canvas. Nothing here decides anything; it renders the
// last frame the server sent and reports what was clicked. Every shape comes
// from the shared glyph set, which is what the legend draws from too.

import { useEffect, useReducer, useRef } from 'react'
import type { Frame } from '@jev-mice/sim'
import { COLOURS, catShade, drawGlyph, mouseShade } from './glyphs'

export function Grid({ frame, width, height, selected, onSelect }: {
  frame: Frame | null
  width: number
  height: number
  selected: string | null
  onSelect: (id: string | null) => void
}): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  const cell = useRef(8)
  const [, bump] = useReducer((n: number) => n + 1, 0)

  // A paused or finished run sends no more frames, so without this the map
  // would keep whatever size the window had when the last one arrived.
  useEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const observer = new ResizeObserver(() => { bump() })
    observer.observe(parent)
    return () => { observer.disconnect() }
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const box = canvas.parentElement?.getBoundingClientRect()
    const avail = box ?? { width: 800, height: 600 }
    const size = Math.max(3, Math.floor(Math.min(avail.width / width, avail.height / height)))
    cell.current = size
    const dpr = window.devicePixelRatio || 1
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
      drawGlyph(ctx, h.occupancy === 'empty' ? 'hole' : 'holeOccupied',
                h.x * size, h.y * size, size)
    }
    for (const f of frame.food) drawGlyph(ctx, 'food', f.x * size, f.y * size, size)
    for (const t of frame.traps) {
      drawGlyph(ctx, t.occupied ? 'trapOccupied' : 'trap', t.x * size, t.y * size, size)
    }
    for (const m of frame.mice) {
      if (m.inHole) continue
      drawGlyph(ctx, 'mouse', m.x * size, m.y * size, size, mouseShade(m.nutrition))
      if (m.id === selected) {
        ctx.strokeStyle = COLOURS.selected
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(m.x * size + size / 2, m.y * size + size / 2, Math.max(2, size / 2), 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    for (const c of frame.cats) {
      drawGlyph(ctx, c.hungry ? 'catHungry' : 'cat', c.x * size, c.y * size, size,
                catShade(c.nutrition))
    }
  }, [frame, width, height, selected])

  return (
    <canvas
      ref={ref}
      className="rounded border border-zinc-800"
      aria-label={frame
        ? `World at tick ${String(frame.tick)} with ${String(frame.mice.length)} mice`
        : 'World, no frame yet'}
      onClick={(e) => {
        if (!frame) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = Math.floor((e.clientX - rect.left) / cell.current)
        const y = Math.floor((e.clientY - rect.top) / cell.current)
        const hit = frame.mice.find((m) => !m.inHole && m.x === x && m.y === y)
        onSelect(hit?.id ?? null)
      }}
    />
  )
}
