// Previous runs, newest first, with what each one started from and what became
// of its animals. This is the page for comparing outcomes across starting
// conditions, which is the reason the telemetry exists.

import { useEffect, useState } from 'react'
import type { RunConfig } from '@jev-mice/engine'
import { api, type Extent, type RunSummary } from './api'

const when = (iso: string): string => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

/** The settings that change an outcome, in the order someone would read them. */
function parameters(c: RunConfig): string {
  return [
    `${String(c.maleMice + c.femaleMice)} mice`,
    `${String(c.cats)} cats`,
    `${String(c.traps)} traps`,
    `${String(c.foodPiles)} food`,
    `${String(c.mouseholes)} holes`,
    `respawn ${String(c.foodRespawnTicks)}`,
    `decay ${String(c.nutritionDecayPerTick)}`,
  ].join(', ')
}

function Range({ e }: { e: Extent }): React.ReactElement {
  return (
    <span className="tabular-nums">
      <span className="text-zinc-200">{e.peak}</span>
      <span className="text-zinc-600"> / </span>
      <span className="text-zinc-400">{e.min}</span>
    </span>
  )
}

function Row({ run }: { run: RunSummary }): React.ReactElement {
  const [open, setOpen] = useState(false)
  const c = run.config
  return (
    <>
      <tr className="border-t border-zinc-800 align-top hover:bg-zinc-900/60">
        <td className="whitespace-nowrap px-3 py-2">
          <a
            href={`#/runs/${run.id}`}
            className="text-sky-400 hover:text-sky-300 hover:underline"
            title="Open this run turn by turn"
          >
            {when(run.createdAt)}
          </a>
        </td>
        <td className="px-3 py-2 tabular-nums text-zinc-300">{run.seed}</td>
        <td className="px-3 py-2 capitalize text-zinc-400">{c.preset}</td>
        <td className="px-3 py-2 text-zinc-400">
          {run.decidedBy === 'jev' ? 'Jev' : 'Rules'}
        </td>
        <td className="px-3 py-2 tabular-nums text-zinc-400">
          {run.currentTick} / {c.ticks}
        </td>
        <td className="px-3 py-2"><Range e={run.population.mice} /></td>
        <td className="px-3 py-2 tabular-nums text-zinc-200">{run.population.mice.current}</td>
        <td className="px-3 py-2"><Range e={run.population.cats} /></td>
        <td className="px-3 py-2 tabular-nums text-zinc-200">{run.population.cats.current}</td>
        <td className="px-3 py-2 text-zinc-400">{run.status}</td>
        <td className="whitespace-nowrap px-3 py-2">
          <button
            type="button"
            onClick={() => { setOpen((o) => !o) }}
            aria-expanded={open}
            className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800
                       hover:text-zinc-100"
          >
            {open ? 'Hide' : 'Settings'}
          </button>
          {/* Both are plain downloads, so the browser saves them without the
              page having to hold a whole run in memory. */}
          <a
            href={`/api/runs/${run.id}/report.md`}
            download
            title="A written report of this run"
            className="ml-1 rounded px-2 py-0.5 text-xs text-sky-400 hover:bg-zinc-800"
          >
            Report
          </a>
          <a
            href={`/api/runs/${run.id}/export`}
            download
            title="Every event of this run, as gzipped JSON lines"
            className="ml-1 rounded px-2 py-0.5 text-xs text-sky-400 hover:bg-zinc-800"
          >
            Data
          </a>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-zinc-900 bg-zinc-950/60">
          <td colSpan={11} className="px-3 py-2 text-xs text-zinc-400">
            <div>{parameters(c)}</div>
            <div className="mt-1 text-zinc-500">
              personality: bold {c.personality.bold}, cautious {c.personality.cautious},
              {' '}vigilant {c.personality.vigilant}, social {c.personality.social}
            </div>
            <div className="mt-1 text-zinc-600">
              paced at {run.speed} a second · {run.totals.requests} judged ·
              {' '}{run.totals.fallbackCount} computed · {run.chunks.length} chunks
              {run.error === null ? '' : ` · ${run.error}`}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const HEADS = [
  'When', 'Seed', 'World', 'Decided by', 'Ticks',
  'Mice peak / min', 'Mice at end', 'Cats peak / min', 'Cats at end', 'Status',
  'Take it away',
] as const

export function Runs({ onBack }: { onBack: () => void }): React.ReactElement {
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      api.list()
        .then((r) => {
          // Newest first, by the time each run was created rather than by the
          // order the server happens to hold them in.
          setRuns([...r].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
          setError(null)
        })
        .catch((e: unknown) => { setError(e instanceof Error ? e.message : 'could not load runs') })
    }
    load()
    const t = setInterval(load, 5000)
    return () => { clearInterval(t) }
  }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-base font-semibold text-zinc-100">Previous runs</h1>
          <span className="text-xs text-zinc-500">
            newest first; open one to read it turn by turn
          </span>
        </div>
        <a
          href="#/"
          onClick={onBack}
          className="rounded border border-zinc-700 px-3 py-1 text-sm text-zinc-200
                     hover:border-zinc-500"
        >
          Back to the live view
        </a>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error !== null && (
          <p role="alert" className="text-sm text-red-300">{error}</p>
        )}
        {runs === null && <p className="text-sm text-zinc-500">Loading.</p>}
        {runs !== null && runs.length === 0 && (
          <p className="text-sm text-zinc-500">
            No runs yet. Start one from the live view and it will appear here.
          </p>
        )}
        {runs !== null && runs.length > 0 && (
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Previous runs, newest first, with seed, settings, and the highest,
              lowest and final mice and cats
            </caption>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                {HEADS.map((h) => (
                  <th key={h} scope="col" className="px-3 pb-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => <Row key={r.id} run={r} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
