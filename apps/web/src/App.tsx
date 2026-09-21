import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PRESETS, TICK_RANGE, type RunConfig } from '@jev-mice/engine'
import type { DecisionLine, Frame, LogEntry } from '@jev-mice/sim'
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
import { Decisions } from './Decisions'
import { TABS, initialTab, type TabId } from './tabs'
import { Speed } from './Speed'
import { Runs } from './Runs'
import { RunDetail } from './RunDetail'
import { Transport } from './Transport'
import { Extinction } from './Extinction'
import { resolve, type Playhead } from './playhead'

const MAX_POINTS = 600
/** Enough to scroll back through without letting the page grow forever. */
const MAX_LOG = 400
/** The same, for the decisions tab. */
const MAX_DECISIONS = 300
/** Frames kept for scanning back through what has already been seen. */
const MAX_FRAMES = 240

interface Point { tick: number; population: number; food: number; cats: number }

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  running: { label: 'running', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  paused: { label: 'paused', dot: 'bg-amber-400', text: 'text-amber-300' },
  queued: { label: 'queued', dot: 'bg-zinc-500', text: 'text-zinc-400' },
  completed: { label: 'finished', dot: 'bg-zinc-500', text: 'text-zinc-400' },
  cancelled: { label: 'stopped', dot: 'bg-zinc-500', text: 'text-zinc-400' },
  failed: { label: 'failed', dot: 'bg-red-400', text: 'text-red-300' },
}

/**
 * Status as a light and a word. A light is read without being parsed.
 *
 * The queue position is part of it, because a queued run sits at turn zero with
 * every control inert and is otherwise indistinguishable from a broken one.
 */
function StatusDot({ status, live, queued }: {
  status: string; live: boolean; queued?: number | null
}): React.ReactElement {
  const s = STATUS[status] ?? STATUS['queued']!
  const ahead = status === 'queued' && typeof queued === 'number' && queued > 1
    ? `, ${String(queued - 1)} ahead`
    : ''
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${
        status === 'running' ? 'animate-pulse' : ''}`} aria-hidden="true" />
      <span className={`text-[11px] ${s.text}`}>
        {s.label}{ahead}{status === 'running' && !live ? ', behind' : ''}
      </span>
    </span>
  )
}

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

export function App(): React.ReactElement {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [run, setRun] = useState<RunSummary | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [playhead, setPlayhead] = useState<Playhead>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<readonly string[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [decisions, setDecisions] = useState<DecisionLine[]>([])
  const [tab, setTab] = useState<TabId>(() => initialTab({ watching: false }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caps, setCaps] = useState<Capabilities>(
    { jevAvailable: false, speed: { slowest: 1, fastest: 334 }, maxTicks: TICK_RANGE.max })
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
    setPlayhead(null)
    setPoints([])
    setLog([])
    setDecisions([])
    // Attaching to a run means there is something to watch, so the panel moves
    // off the history it was showing while idle.
    setTab(initialTab({ watching: true }))
    setSelected(null)
    setHighlighted([])
    stop.current = watchRun(id, (m) => {
      if (m.t === 'hello') {
        setRun(m.run)
        if (m.frame) setFrames([m.frame])
        setLog(m.log.slice(-MAX_LOG))
        setDecisions(m.decisions.slice(-MAX_DECISIONS))
      } else if (m.t === 'log') {
        setLog((l) => [...l, ...m.entries].slice(-MAX_LOG))
      } else if (m.t === 'decisions') {
        setDecisions((d) => [...d, ...m.entries].slice(-MAX_DECISIONS))
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
        if (m.run.status === 'failed' && m.run.error !== null) setError(m.run.error)
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

  const queued = useMemo(() => runs.filter((r) => r.status === 'queued'), [runs])

  /**
   * Drop every run still waiting to start.
   *
   * A run paced slowly holds its slot for as long as it lasts, so a few long
   * runs leave everything after them queued, and a queued run is inert in a way
   * that looks broken. Without this the only way out is to wait, or to stop them
   * one at a time.
   */
  const clearQueued = useCallback(() => {
    void Promise.all(queued.map((r) => api.control(r.id, 'stop').catch(() => undefined)))
      .then(refresh)
  }, [queued, refresh])

  const act = useCallback((a: 'pause' | 'resume' | 'step' | 'stop') => {
    if (!run) return
    void api.control(run.id, a).then(refresh).catch(() => undefined)
  }, [run, refresh])

  const at = resolve(frames.map((f) => f.tick), playhead)
  const frame = at.index < 0 ? null : frames[at.index] ?? null

  const over = run === null || run.status === 'completed' || run.status === 'failed'
    || run.status === 'cancelled'

  const transport = {
    play: () => { setPlayhead(null); act('resume') },
    pause: () => { act('pause') },
    stop: () => { act('stop') },
    toStart: () => { setPlayhead(at.start) },
    toEnd: () => { setPlayhead(null) },
    stepBack: () => { setPlayhead(at.back) },
    stepForward: () => {
      // Out of the buffer first; at the newest frame, ask for another turn.
      if (at.live) act('step')
      else setPlayhead(at.forward)
    },
    seek: (i: number) => { setPlayhead(at.seek(i)) },
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
      {/* Two rows rather than one. Everything used to compete for a single line,
          and at 1280 the result was a two-line title beside a three-line
          "decided by the fixed rules". Identity belongs on top; the transport is
          a strip of its own, which is where a person looks for it anyway. */}
      <header className="shrink-0 border-b border-zinc-800">
        <div className="flex items-center gap-4 px-4 py-2">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="shrink-0 text-sm font-semibold tracking-tight text-zinc-100">
              jev-mice
            </h1>
            <span className="hidden truncate text-xs text-zinc-600 lg:block">
              mice, cats, traps and food, decided one animal at a time
            </span>
          </div>

          {run && (
            <div className="ml-auto flex shrink-0 items-center gap-2.5 text-xs">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase
                            tracking-wide ${
                  run.decidedBy === 'jev'
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'bg-zinc-800 text-zinc-400'}`}
              >
                {run.decidedBy === 'jev' ? 'Jev' : 'rules'}
              </span>
              <span className="tabular-nums text-zinc-500">
                turn <span className="text-zinc-200">
                  {(frame?.tick ?? run.currentTick).toLocaleString('en-US')}
                </span>
                <span className="text-zinc-600"> / {run.config.ticks.toLocaleString('en-US')}</span>
              </span>
              <StatusDot status={run.status} live={at.live}
                         queued={run.queuePosition} />
            </div>
          )}
        </div>

        {run && (
          <div className="flex items-center justify-end gap-4 border-t border-zinc-800/70
                          bg-zinc-900/30 px-4 py-1.5">
            <Speed
              speed={run.speed}
              fastest={caps.speed.fastest}
              disabled={run.status === 'completed' || run.status === 'failed'
                        || run.status === 'cancelled'}
              onChange={setSpeed}
            />
            <Transport
              state={{
                playing: run.status === 'running',
                over,
                live: at.live,
                buffered: frames.length,
                index: at.index,
                tick: frame?.tick ?? run.currentTick,
                totalTicks: run.config.ticks,
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
        {/* Sized to show everything at once down to a 720-pixel window, which is
            what moving the runs list out to the HISTORY tab and dropping the
            per-field range lines bought. The scroll is a safety net for a window
            shorter than that, not the plan: without it a field below the fold is
            unreachable rather than merely out of sight. Start is first either
            way, so it is never the thing that goes. */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-zinc-800
                          bg-zinc-950/40 p-4">
          <Configure onStart={start} busy={busy} jevAvailable={caps.jevAvailable}
                     maxTicks={caps.maxTicks} />
        </aside>

        {/* No items-center on the column: it would shrink the grid's wrapper to
            the canvas the canvas is sized from, and the map would collapse. */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4">
          {run
            ? <>
                <div className="relative flex min-h-0 w-full flex-1 items-center
                                justify-center rounded-lg border border-zinc-800/80
                                bg-zinc-950/60 p-2">
                  <Grid frame={frame} width={world.width} height={world.height}
                        selected={selected} highlighted={highlighted}
                        onSelect={setSelected} />
                  {run.endReason === 'extinct' && (
                    <Extinction tick={run.currentTick} />
                  )}
                  {run.status === 'queued' && (
                    <div className="absolute inset-0 flex items-center justify-center
                                    bg-zinc-950/70 p-6 text-center">
                      <p className="max-w-sm text-sm text-zinc-400">
                        <span className="block font-medium text-zinc-200">
                          Waiting in the queue
                        </span>
                        <span className="mt-1 block text-xs">
                          {typeof run.queuePosition === 'number' && run.queuePosition > 1
                            ? `${String(run.queuePosition - 1)} runs are ahead of this one. `
                            : ''}
                          This machine runs a few simulations at a time and starts
                          this one when a slot frees. Nothing will move, and the
                          controls stay inert, until it does.
                        </span>
                      </p>
                    </div>
                  )}
                </div>
                <Legend />
              </>
            : <p className="m-auto max-w-sm text-center text-sm text-zinc-500">
                Set the starting conditions and start a run. The world appears here and
                keeps going on the server, so closing this page does not stop it.
              </p>}
        </main>

        {/* w-72 is 18rem; a quarter wider is 22.5rem. Named exactly rather than
            rounded to the nearest step, because the step above is 24rem and
            takes a third of the map with it. */}
        <aside className="flex w-[22.5rem] shrink-0 flex-col overflow-hidden border-l
                          border-zinc-800 bg-zinc-950/40 p-4">
          <Inspector frame={frame} id={selected} onClear={() => { setSelected(null) }} />
          <h2 className="mt-4 text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            Over time
          </h2>
          {/* Always drawn, even with nothing in it. It used to be replaced by a
              line of text until the first frames arrived, so the whole panel
              jumped the moment a run started. An empty chart is a frame waiting
              to be filled; a line of text is a different layout. */}
          <div className="relative mt-2">
            <Chart ticks={ticks} series={series} />
            {points.length <= 1 && (
              <p className="absolute inset-0 flex items-center justify-center
                            text-xs text-zinc-600">
                {run && over ? 'This run is over.' : 'Waiting for the first frames.'}
              </p>
            )}
          </div>
          {run && (
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border
                           border-zinc-800/80 bg-zinc-900/40 px-2.5 py-2 text-xs">
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
          <section className="mt-4 flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label="Detail" className="flex gap-1 border-b border-zinc-800">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => { setTab(t.id) }}
                  className={`-mb-px border-b-2 px-2 py-1 text-[11px] font-medium tracking-wide ${
                    tab === t.id
                      ? 'border-sky-500 text-sky-200'
                      : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'ecosystem' && (run
              ? <Log entries={log} decidedBy={run.decidedBy} onHover={setHighlighted} />
              : <p className="mt-2 text-xs text-zinc-600">
                  Start a run and the births, deaths and near misses appear here.
                </p>)}

            {tab === 'decisions' && (run
              ? <Decisions entries={decisions} decidedBy={run.decidedBy} />
              : <p className="mt-2 text-xs text-zinc-600">
                  Start a run and every question and answer appears here.
                </p>)}

            {tab === 'history' && (
              <div className="mt-2 flex min-h-0 flex-1 flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <a
                    href="#/runs"
                    target="_blank"
                    rel="noopener"
                    className="text-xs text-sky-400 hover:text-sky-300 hover:underline"
                  >
                    See all previous runs
                  </a>
                  {queued.length > 0 && (
                    <button
                      type="button"
                      onClick={clearQueued}
                      title={'Stop every run still waiting to start. Nothing already '
                        + 'running is touched.'}
                      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px]
                                 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                    >
                      Clear {queued.length} queued
                    </button>
                  )}
                </div>
                <ul className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto">
                  {runs.length === 0 && <li className="text-xs text-zinc-600">Nothing yet.</li>}
                  {runs.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => { setRun(r); open(r.id) }}
                        aria-current={run?.id === r.id}
                        className={`w-full rounded px-2 py-1 text-left text-xs ${
                          run?.id === r.id
                            ? 'bg-zinc-800 text-zinc-100'
                            : 'text-zinc-400 hover:bg-zinc-900'}`}
                      >
                        <span className="block truncate">
                          seed {r.seed} · {r.config.preset} · tick {r.currentTick}
                        </span>
                        <span className="text-[11px] text-zinc-600">{r.status}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
