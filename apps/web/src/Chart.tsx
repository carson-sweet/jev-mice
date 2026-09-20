// The population and cause-of-death series. One chart component, fed whatever
// series the caller names, so adding a measure is a change to its caller.

import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { drawGlyph, type GlyphKind } from './glyphs'

export interface Series {
  label: string
  colour: string
  values: number[]
  /** The same glyph this thing has on the map, so the two cannot disagree. */
  glyph: GlyphKind
}

const MARKER = 14

/**
 * uPlot draws its own legend markers as coloured squares, which made food and
 * cats read as the same shape and put a cat under the colour the map uses for
 * a trap. This replaces each marker with the map's glyph. The legend rows are
 * built once, so injecting after init is enough.
 */
function paintMarkers(root: HTMLElement, series: readonly Series[]): void {
  for (const row of root.querySelectorAll('.u-series')) {
    const label = row.querySelector('.u-label')?.textContent?.trim()
    const marker = row.querySelector('.u-marker')
    if (!label || !(marker instanceof HTMLElement)) continue
    const match = series.find((s) => s.label === label)
    if (!match) continue

    marker.textContent = ''
    marker.style.border = 'none'
    marker.style.background = 'none'
    marker.style.width = `${String(MARKER)}px`
    marker.style.height = `${String(MARKER)}px`

    const canvas = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    canvas.width = MARKER * dpr
    canvas.height = MARKER * dpr
    canvas.style.width = `${String(MARKER)}px`
    canvas.style.height = `${String(MARKER)}px`
    canvas.setAttribute('aria-hidden', 'true')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawGlyph(ctx, match.glyph, 0, 0, MARKER, match.colour)
    }
    marker.appendChild(canvas)
  }
}

export function Chart({ ticks, series, height = 140 }: {
  ticks: number[]
  series: Series[]
  height?: number
}): React.ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const data = [ticks, ...series.map((s) => s.values)] as unknown as uPlot.AlignedData
    if (plot.current) {
      plot.current.setData(data)
      return
    }
    const created = new uPlot({
      width: el.clientWidth || 320,
      height,
      // The x axis is a tick count, not a clock. Left as time, uPlot renders
      // every tick as a date in 1970.
      scales: { x: { time: false } },
      padding: [8, 8, 0, 0],
      legend: { show: true },
      axes: [
        { stroke: '#64748b', grid: { stroke: '#1e293b' }, ticks: { stroke: '#1e293b' } },
        { stroke: '#64748b', grid: { stroke: '#1e293b' }, ticks: { stroke: '#1e293b' } },
      ],
      series: [
        { label: 'tick' },
        ...series.map((s) => ({ label: s.label, stroke: s.colour, width: 1.5 })),
      ],
    }, data, el)
    plot.current = created
    paintMarkers(el, series)
    return () => { plot.current?.destroy(); plot.current = null }
  }, [ticks, series, height])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      plot.current?.setSize({ width: el.clientWidth || 320, height })
    })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [height])

  return <div ref={host} className="w-full" />
}
