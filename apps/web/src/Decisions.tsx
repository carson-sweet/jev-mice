// The DECISIONS tab: what went to the decider and what came back.
//
// The point of the whole project is legible on this one panel, so a line pairs
// the situation with the answer rather than showing an intent on its own. An
// intent with nothing beside it says nothing about whether the judgment was any
// good.
//
// Rows are memoised for the reason the log's are: appending produces a new
// array and React would otherwise re-render every line on every flush.

import { memo, useEffect, useRef, useState } from 'react'
import type { DecisionLine } from '@jev-mice/sim'

const SOURCE: Record<string, { label: string; className: string }> = {
  jev: { label: 'Jev', className: 'bg-sky-500/15 text-sky-300' },
  baseline: { label: 'rules', className: 'bg-zinc-700/50 text-zinc-300' },
}

const Row = memo(function Row({ line }: { line: DecisionLine }): React.ReactElement {
  const tag = SOURCE[line.source] ?? SOURCE['baseline']!
  return (
    <li className="rounded px-1 py-1 text-xs leading-snug hover:bg-zinc-800/60">
      <div className="flex items-baseline gap-2">
        <span className="tabular-nums text-zinc-600">{line.tick}</span>
        <span className={`rounded px-1 text-[10px] uppercase tracking-wide ${tag.className}`}>
          {tag.label}
        </span>
        {line.fallback !== undefined && (
          <span className="text-[11px] text-amber-400">fell back: {line.fallback}</span>
        )}
        <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-600">
          {line.subjects.length > 0 && `${line.subjects.length} asked`}
          {line.latencyMs > 0 && ` · ${Math.round(line.latencyMs)}ms`}
          {line.inputTokens !== undefined && ` · ${line.inputTokens.toLocaleString('en-US')} tok`}
        </span>
      </div>
      {line.subjects.map((s) => (
        <div key={s.agentId} className="mt-0.5 pl-6">
          <span className="text-zinc-500">{s.agentId}</span>
          {' '}
          <span className="text-zinc-400">{s.situation}</span>
          {' '}
          <span className="text-zinc-600">&rarr;</span>
          {' '}
          <span className="text-zinc-100">{s.intent}</span>
          <span className="text-zinc-500">, {s.fear}</span>
          {s.confidence > 0 && (
            <span className="text-zinc-600"> ({Math.round(s.confidence * 100)}%)</span>
          )}
        </div>
      ))}
    </li>
  )
})

export function Decisions({ entries, decidedBy }: {
  entries: readonly DecisionLine[]
  decidedBy: 'jev' | 'rules'
}): React.ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  useEffect(() => {
    const el = box.current
    if (!el || !pinned) return
    el.scrollTop = el.scrollHeight
  }, [entries, pinned])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!pinned && (
        <button
          type="button"
          onClick={() => { setPinned(true) }}
          className="self-end text-[11px] text-sky-400 hover:text-sky-300 hover:underline"
        >
          Follow the newest
        </button>
      )}
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
        }}
        role="log"
        aria-label="Decisions as they are made"
        className="mt-1.5 min-h-24 flex-1 overflow-y-auto rounded border border-zinc-800
                   bg-zinc-950/60 p-2"
      >
        {entries.length === 0
          ? <p className="text-xs text-zinc-600">
              {decidedBy === 'jev'
                ? 'Waiting for the first answers from Jev.'
                : 'This run is decided by the fixed rules. Every answer below is computed, '
                  + 'not judged.'}
            </p>
          : <ol className="space-y-1">
              {entries.map((e) => <Row key={e.seq} line={e} />)}
            </ol>}
      </div>
    </div>
  )
}
