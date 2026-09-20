import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PRESETS, type RunConfig } from '@jev-mice/engine'
import type { Frame, LogEntry } from '@jev-mice/sim'
import {
  api, watchRun, type Capabilities, type Decider, type RunSummary,
} from './api'
import { Grid } from './Grid'
import { Chart } from './Chart'
import { Inspector } from './Inspector'
import { Configure } from './Configure'
import { Legend } from './Legend'
import { COLOURS } from './glyphs'
import { Log } from './Log'
import { Speed } from './Speed'
import { Runs } from './Runs'
import { RunDetail } from './RunDetail'
import { Transport } from './Transport'

const MAX_POINTS = 600
/** Enough to scroll back through without letting the page grow forever. */
const MAX_LOG = 400
/** Frames kept for scanning back through what has already been seen. */
const MAX_FRAMES = 240
/** How far a scan jumps, in frames. */
const SCAN = 10

interface Point { tick: number; population: number; food: number; cats: number }

/** Two pages, addressable so a link to the library can be shared or bookmarked. */
function useRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const on = (): void => { setHash(window.location.hash || '#/') }
    window.addEventListener('hashchange', on)
    return () => { window.removeEventListener('hashchange', on) }
  }, [])
  return hash
}

function Controls({ run, onAction }: {
  run: RunSummary
  onAction: (a: 'pause' | 'resume' | 'step' | 'stop') => void
}): React.ReactElement {
  const over = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled'
  const btn = 'rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-200 ' +
              'hover:border-zinc-500 disabled:cursor-not-allowed disabled:text-zinc-600'
  return (
    <div className="flex items-center gap-2">
      {run.status === 'paused'
        ? <button type="button" className={btn} onClick={() => { onAction('resume') }}>Resume</button>
        : <button type="button" className={btn} disabled={over}
                  onClick={() => { onAction('pause') }}>Pause</button>}
      <button type="button" className={btn} disabled={over || run.status !== 'paused'}
              onClick={() => { onAction('step') }}>Step</button>
      <button type="button" className={btn} disabled={over}
              onClick={() => { onAction('stop') }}>Stop</button>
    </div>
  )
}

function Status({ run }: { run: RunSummary }): React.ReactElement {
  const tone: Record<string, string> = {
    running: 'text-emerald-300 border-emerald-800 bg-emerald-950/40',
    paused: 'text-amber-300 border-amber-800 bg-amber-950/40',
    queued: 'text-sky-300 border-sky-800 bg-sky-950/40',
    completed: 'text-zinc-300 border-zinc-700 bg-zinc-900',
    failed: 'text-red-300 border-red-800 bg-red-950/40',
    cancelled: 'text-zinc-400 border-zinc-700 bg-zinc-900',
  }
  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${tone[run.status] ?? ''}`}>
      {run.status}
      {run.status === 'queued' && run.queuePosition !== null
        ? `, ${String(run.queuePosition)} in line`
        : ''}
    </span>
  )
}

export function App(): React.ReactElement {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [run, setRun] = useState<RunSummary | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [behind, setBehind] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<readonly string[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caps, setCaps] = useState<Capabilities>(
    { jevAvailable: false, speed: { slowest: 1, fastest: 334 } })
  const stop = useRef<(() => void) | null>(null)
  const route = useRoute()

  useEffect(() => {
    void api.capabilities().then(setCaps).catch(() => undefined)
  }, [])

  const refresh = useCallback(() => {
    void api.list().then(setRuns).catch(() => undefined)
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 4000)
    return () => { clearInterval(t) }
  }, [refresh])

  const open = useCallback((id: string) => {
    stop.current?.()
    setFrames([])
    setBehind(0)
    setPoints([])
    setLog([])
    setSelected(null)
    setHighlighted([])
    stop.current = watchRun(id, (m) => {
      if (m.t === 'hello') {
        setRun(m.run)
        if (m.frame) setFrames([m.frame])
        setLog(m.log.slice(-MAX_LOG))
      } else if (m.t === 'log') {
        setLog((l) => [...l, ...m.entries].slice(-MAX_LOG))
      } else if (m.t === 'frame') {
        setFrames((f) => [...f, m.frame].slice(-MAX_FRAMES))
        setPoints((p) => [...p, {
          tick: m.frame.tick,
          population: m.frame.population,
          food: m.frame.food.length,
          cats: m.frame.cats.length,
        }].slice(-MAX_POINTS))
      } else if (m.t === 'status') {
        setRun(m.run)
      } else {
        setError(m.message)
      }
    })
  }, [])

  useEffect(() => () => { stop.current?.() }, [])

  const start = useCallback((o: {
    config: RunConfig; seed?: number; decider: Decider
  }) => {
    setBusy(true)
    setError(null)
    api.create(o)
      .then((created) => { setRun(created); open(created.id); refresh() })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : 'could not start') })
      .finally(() => { setBusy(false) })
  }, [open, refresh])

  const setSpeed = useCallback((ticksPerSecond: number) => {
    setRun((r) => (r === null ? r : { ...r, speed: ticksPerSecond }))
    const id = run?.id
    if (id !== undefined) void api.setSpeed(id, ticksPerSecond).catch(() => undefined)
  }, [run?.id])

  const act = useCallback((a: 'pause' | 'resume' | 'step' | 'stop') => {
    if (!run) return
    void api.control(run.id, a).then(refresh).catch(() => undefined)
  }, [run, refresh])

  // The playhead. At zero it is the newest frame, which is the live edge.
  const frame = frames.length === 0
    ? null
    : frames[Math.max(0, frames.length - 1 - behind)] ?? null

  const over = run === null || run.status === 'completed' || run.status === 'failed'
    || run.status === 'cancelled'

  const transport = {
    play: () => { setBehind(0); act('resume') },
    pause: () => { act('pause') },
    stop: () => { act('stop') },
    live: () => { setBehind(0) },
    stepBack: () => { setBehind((b) => Math.min(frames.length - 1, b + 1)) },
    stepForward: () => {
      // Forward out of the buffer first; at the live edge, ask for a turn.
      if (behind > 0) setBehind((b) => Math.max(0, b - 1))
      else act('step')
    },
    scanBack: () => { setBehind((b) => Math.min(frames.length - 1, b + SCAN)) },
    scanForward: () => { setBehind((b) => Math.max(0, b - SCAN)) },
  }

  const world = run ? PRESETS[run.config.preset] : PRESETS.medium
  const ticks = useMemo(() => points.map((p) => p.tick), [points])
  // Colours and glyphs come from the map's own set, so a line in the chart and
  // a thing on the grid are never a different shape or a different colour.
  const series = useMemo(() => [
    { label: 'mice', colour: COLOURS.mouse, glyph: 'mouse' as const,
      values: points.map((p) => p.population) },
    { label: 'food', colour: COLOURS.food, glyph: 'food' as const,
      values: points.map((p) => p.food) },
    { label: 'cats', colour: COLOURS.cat, glyph: 'cat' as const,
      values: points.map((p) => p.cats) },
  ], [points])

  const detail = /^#\/runs\/(.+)$/.exec(route)
  if (detail) return <RunDetail id={detail[1] ?? ''} />
  if (route.startsWith('#/runs')) return <Runs onBack={() => undefined} />

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold text-zinc-100">jev-mice</h1>
          <span className="text-xs text-zinc-500">
            mice, cats, traps and food, decided one animal at a time
          </span>
        </div>
        {run && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              tick {run.currentTick} of {run.config.ticks}
            </span>
            <span className="text-xs text-zinc-500">
              decided by {run.decidedBy === 'jev' ? 'Jev' : 'the fixed rules'}
            </span>
            <Speed
              speed={run.speed}
              fastest={caps.speed.fastest}
              disabled={run.status === 'completed' || run.status === 'failed'
                        || run.status === 'cancelled'}
              onChange={setSpeed}
            />
            <Status run={run} />
            <Transport
              state={{
                playing: run.status === 'running',
                over,
                behind,
                buffered: frames.length,
              }}
              actions={transport}
            />
          </div>
        )}
      </header>

      {error !== null && (
        <div role="alert" className="border-b border-red-900 bg-red-950/50 px-4 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-zinc-800 p-4">
          <Configure onStart={start} busy={busy} jevAvailable={caps.jevAvailable} />
          <div className="mt-6 flex items-baseline justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Runs</h2>
            <a
              href="#/runs"
              target="_blank"
              rel="noopener"
              className="text-xs text-sky-400 hover:text-sky-300 hover:underline"
            >
              See all previous runs
            </a>
          </div>
          <ul className="mt-2 space-y-1">
            {runs.length === 0 && <li className="text-xs text-zinc-600">Nothing yet.</li>}
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => { setRun(r); open(r.id) }}
                  aria-current={run?.id === r.id}
                  className={`w-full rounded px-2 py-1 text-left text-xs ${
                    run?.id === r.id ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900'}`}
                >
                  <span className="block truncate">
                    seed {r.seed} · {r.config.preset} · tick {r.currentTick}
                  </span>
                  <span className="text-[11px] text-zinc-600">{r.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* No items-center on the column: it would shrink the grid's wrapper to
            the canvas the canvas is sized from, and the map would collapse. */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
          {run
            ? <>
                <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                  <Grid frame={frame} width={world.width} height={world.height}
                        selected={selected} highlighted={highlighted}
                        onSelect={setSelected} />
                </div>
                <Legend />
              </>
            : <p className="m-auto max-w-sm text-center text-sm text-zinc-500">
                Set the starting conditions and start a run. The world appears here and
                keeps going on the server, so closing this page does not stop it.
              </p>}
        </main>

        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l
                          border-zinc-800 p-4">
          <Inspector frame={frame} id={selected} onClear={() => { setSelected(null) }} />
          <h2 className="mt-4 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Over time
          </h2>
          <div className="mt-2">
            {points.length > 1
              ? <Chart ticks={ticks} series={series} />
              : <p className="text-xs text-zinc-600">Waiting for the first frames.</p>}
          </div>
          {run && (
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-zinc-500">Judged</dt>
              <dd className="tabular-nums text-zinc-200">{run.totals.requests}</dd>
              <dt className="text-zinc-500">Computed</dt>
              <dd className="tabular-nums text-zinc-200">{run.totals.fallbackCount}</dd>
              <dt className="text-zinc-500">Chunks</dt>
              <dd className="tabular-nums text-zinc-200">{run.chunks.length}</dd>
              <dt className="text-zinc-500">Seed</dt>
              <dd className="tabular-nums text-zinc-200">{run.seed}</dd>
            </dl>
          )}
          {run && (
            <Log entries={log} decidedBy={run.decidedBy} onHover={setHighlighted} />
          )}
        </aside>
      </div>
    </div>
  )
}
