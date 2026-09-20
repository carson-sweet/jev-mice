// The world, drawn on a canvas. Nothing here decides anything; it renders the
// last frame the server sent and reports what was clicked.

import { useEffect, useRef } from 'react'
import type { Frame } from '@jev-mice/sim'

const COLOURS = {
  bg: '#0b0d10',
  grid: '#151a21',
  food: '#4ade80',
  trap: '#f87171',
  trapOccupied: '#7f1d1d',
  hole: '#475569',
  holeUsed: '#94a3b8',
  cat: '#fb923c',
  selected: '#facc15',
}

/** Nutrition drives the fill, so a starving mouse reads as pale at a glance. */
function mouseColour(nutrition: number, inHole: boolean): string {
  if (inHole) return '#334155'
  const t = Math.max(0, Math.min(100, nutrition)) / 100
  const r = Math.round(180 - 60 * t)
  const g = Math.round(110 + 110 * t)
  const b = Math.round(220 - 40 * t)
  return `rgb(${String(r)},${String(g)},${String(b)})`
}

export function Grid({ frame, width, height, selected, onSelect }: {
  frame: Frame | null
  width: number
  height: number
  selected: string | null
  onSelect: (id: string | null) => void
}): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  const cell = useRef(8)

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

    ctx.fillStyle = COLOURS.bg
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

    const box2 = (x: number, y: number, colour: string, inset = 1): void => {
      ctx.fillStyle = colour
      ctx.fillRect(x * size + inset, y * size + inset, size - inset * 2, size - inset * 2)
    }

    for (const h of frame.holes) {
      box2(h.x, h.y, h.occupancy === 'empty' ? COLOURS.hole : COLOURS.holeUsed, 2)
    }
    for (const f of frame.food) box2(f.x, f.y, COLOURS.food, 2)
    for (const t of frame.traps) box2(t.x, t.y, t.occupied ? COLOURS.trapOccupied : COLOURS.trap, 2)

    for (const m of frame.mice) {
      ctx.fillStyle = mouseColour(m.nutrition, m.inHole)
      ctx.beginPath()
      ctx.arc(m.x * size + size / 2, m.y * size + size / 2, Math.max(1.5, size / 2 - 1), 0, Math.PI * 2)
      ctx.fill()
      if (m.id === selected) {
        ctx.strokeStyle = COLOURS.selected
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    for (const c of frame.cats) {
      ctx.fillStyle = COLOURS.cat
      const cx = c.x * size + size / 2
      const cy = c.y * size + size / 2
      const r = Math.max(2, size / 2)
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy + r)
      ctx.lineTo(cx - r, cy + r)
      ctx.closePath()
      ctx.fill()
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
        const hit = frame.mice.find((m) => m.x === x && m.y === y)
        onSelect(hit?.id ?? null)
      }}
    />
  )
}
