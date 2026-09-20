// The population and cause-of-death series. One chart component, fed whatever
// series the caller names, so adding a measure is a change to its caller.

import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface Series { label: string; colour: string; values: number[] }

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
    plot.current = new uPlot({
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
