// Everything that happened in one run, turn by turn. Each row is a turn with
// what was standing at the end of it and how that changed; opening a row shows
// every life-changing event of that turn.

import { useEffect, useState } from 'react'
import { api, type RunSummary, type Turn, type TurnStats } from './api'
import { COLOURS } from './glyphs'
import {
  PAGE_SIZES, DEFAULT_PAGE_SIZE, pageCount, rangeFor, pageContaining, clampPage,
} from './paging'

const COUNT_COLOUR: Record<keyof TurnStats, string> = {
  mice: COLOURS.mouse,
  cats: COLOURS.cat,
  food: COLOURS.food,
  traps: COLOURS.trap,
}

function Delta({ n }: { n: number }): React.ReactElement | null {
  if (n === 0) return null
  return (
    <span className={n > 0 ? 'text-emerald-400' : 'text-red-400'}>
      {' '}{n > 0 ? '+' : ''}{n}
    </span>
  )
}

function Count({ which, value, delta }: {
  which: keyof TurnStats; value: number; delta: number
}): React.ReactElement {
  return (
    <span className="tabular-nums">
      <span style={{ color: COUNT_COLOUR[which] }}>{value}</span>
      <Delta n={delta} />
    </span>
  )
}

/** Reads as what happened, so a quiet turn is obvious without opening it. */
const NOTABLE: Record<string, string> = {
  death: 'died', birth: 'born', mating: 'mated', capture: 'caught',
  mouse_trapped: 'trapped', food_eaten: 'ate', cat_died: 'cat starved',
  hunger_changed: 'hunger', cap_limited_birth: 'litter lost',
  food_respawned: 'food back', trap_respawned: 'trap reset',
  run_ended: 'run ended',
}

function summarize(turn: Turn): string {
  const counts = new Map<string, number>()
  let spotted = 0
  for (const e of turn.events) {
    if (e.kind === 'spotted') { spotted++; continue }
    const label = NOTABLE[e.kind]
    if (label === undefined) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const parts = [...counts.entries()].map(([label, n]) => `${String(n)} ${label}`)
  if (parts.length === 0) {
    return spotted === 0 ? 'nothing but movement' : `${String(spotted)} spotted something`
  }
  return parts.join(', ')
}

function TurnRow({ turn }: { turn: Turn }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const count = turn.events.length
  return (
    <>
      <tr className="border-t border-zinc-800 hover:bg-zinc-900/60">
        <td className="px-3 py-1.5">
          <button
            type="button"
            onClick={() => { setOpen((o) => !o) }}
            aria-expanded={open}
            disabled={count === 0}
            className="w-full text-left tabular-nums text-zinc-200 disabled:text-zinc-500"
          >
            <span className="inline-block w-3 text-zinc-500">
              {count === 0 ? '' : open ? '−' : '+'}
            </span>
            {' '}{turn.tick}
          </button>
        </td>
        <td className="px-3 py-1.5"><Count which="mice" value={turn.stats.mice} delta={turn.delta.mice} /></td>
        <td className="px-3 py-1.5"><Count which="cats" value={turn.stats.cats} delta={turn.delta.cats} /></td>
        <td className="px-3 py-1.5"><Count which="food" value={turn.stats.food} delta={turn.delta.food} /></td>
        <td className="px-3 py-1.5"><Count which="traps" value={turn.stats.traps} delta={turn.delta.traps} /></td>
        <td className="px-3 py-1.5 text-xs text-zinc-500">
          {count === 0 ? 'nothing but movement' : summarize(turn)}
        </td>
      </tr>
      {open && (
        <tr className="bg-zinc-950/60">
          <td colSpan={6} className="px-3 py-2">
            <ul className="space-y-0.5">
              {turn.events.map((e, i) => (
                <li key={`${e.kind}-${String(i)}`} className="flex gap-2 text-xs">
                  <span className="w-40 shrink-0 text-zinc-600">{e.kind}</span>
                  <span className="text-zinc-300">{e.text}</span>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

const NAV = 'rounded border border-zinc-700 px-2 py-1 text-zinc-200 '
  + 'hover:border-zinc-500 disabled:cursor-not-allowed disabled:border-zinc-800 '
  + 'disabled:text-zinc-600'

export function RunDetail({ id }: { id: string }): React.ReactElement {
  const [run, setRun] = useState<RunSummary | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(DEFAULT_PAGE_SIZE)
  const [window_, setWindow] = useState<{ turns: Turn[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.get(id).then(setRun).catch(() => undefined)
  }, [id])

  // The run's own turn count is the best guess until the server answers, which
  // keeps the page numbers steady instead of jumping once the first page lands.
  const total = window_?.total ?? run?.currentTick ?? 0
  const pages = pageCount(total, perPage)
  const current = clampPage(page, total, perPage)
  const { from, to } = rangeFor(current, perPage, total)

  useEffect(() => {
    setBusy(true)
    let stale = false
    api.turns(id, from, to)
      .then((w) => {
        if (stale) return
        setWindow({ turns: w.turns, total: w.totalTurns })
        setError(null)
      })
      .catch((e: unknown) => {
        if (stale) return
        setError(e instanceof Error ? e.message : 'could not read the telemetry')
      })
      .finally(() => { if (!stale) setBusy(false) })
    return () => { stale = true }
  }, [id, from, to])

  const resize = (next: number): void => {
    // Hold the reader's place: whatever turn was at the top of the page stays
    // on screen, rather than being thrown back to page one.
    setPerPage(next)
    setPage(pageContaining(from, next))
  }

  const withEvents = window_?.turns.filter((t) => t.events.length > 0).length ?? 0

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold text-zinc-100">
            {run === null ? 'Run' : `Seed ${String(run.seed)}`}
          </h1>
          <span className="text-xs text-zinc-500">
            {run === null
              ? 'turn by turn'
              : `${run.config.preset}, ${String(run.config.ticks)} turns, decided by `
                + `${run.decidedBy === 'jev' ? 'Jev' : 'the rules'}`}
          </span>
        </div>
        <a
          href="#/runs"
          className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-200
                     hover:border-zinc-500"
        >
          All runs
        </a>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-900
                      px-4 py-2 text-xs">
        <div className="flex items-center gap-1" role="group" aria-label="Pages">
          <button type="button" className={NAV} disabled={current <= 1 || busy}
                  aria-label="First page" title="First page"
                  onClick={() => { setPage(1) }}>
            First
          </button>
          <button type="button" className={NAV} disabled={current <= 1 || busy}
                  aria-label="Previous page" title="Previous page"
                  onClick={() => { setPage(current - 1) }}>
            Previous
          </button>
          <span className="flex items-center gap-1 px-1 text-zinc-400">
            Page
            <input
              type="number"
              min={1}
              max={pages}
              value={current}
              aria-label="Page number"
              onChange={(e) => { setPage(clampPage(Number(e.target.value), total, perPage)) }}
              className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5
                         text-center tabular-nums text-zinc-100 focus:border-sky-500
                         focus:outline-none"
            />
            <span className="tabular-nums">of {pages}</span>
          </span>
          <button type="button" className={NAV} disabled={current >= pages || busy}
                  aria-label="Next page" title="Next page"
                  onClick={() => { setPage(current + 1) }}>
            Next
          </button>
          <button type="button" className={NAV} disabled={current >= pages || busy}
                  aria-label="Last page" title="Last page"
                  onClick={() => { setPage(pages) }}>
            Last
          </button>
        </div>

        <label className="flex items-center gap-1 text-zinc-400">
          Per page
          <select
            value={perPage}
            aria-label="Turns per page"
            onChange={(e) => { resize(Number(e.target.value)) }}
            className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5
                       text-zinc-100 focus:border-sky-500 focus:outline-none"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <span className="tabular-nums text-zinc-500">
          turns {from} to {to} of {total}
        </span>

        <label className="flex items-center gap-1 text-zinc-500">
          Go to turn
          <input
            type="number"
            min={1}
            max={Math.max(1, total)}
            aria-label="Go to a turn number"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const n = Number((e.target as HTMLInputElement).value)
              if (Number.isFinite(n)) setPage(pageContaining(n, perPage))
            }}
            className="w-20 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5
                       tabular-nums text-zinc-100 focus:border-sky-500 focus:outline-none"
          />
        </label>

        <span className="text-zinc-600">
          {withEvents} of these turns had something happen
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error !== null && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {window_ === null && error === null && <p className="text-sm text-zinc-500">Loading.</p>}
        {window_ !== null && (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Every turn of this run with its counts, the change from the turn
              before, and the events of that turn
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                {['Turn', 'Mice', 'Cats', 'Food', 'Traps', 'What happened'].map((h) => (
                  <th key={h} scope="col" className="px-3 pb-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {window_.turns.map((t) => <TurnRow key={t.tick} turn={t} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
