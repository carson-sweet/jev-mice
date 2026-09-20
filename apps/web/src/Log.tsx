// The running log: every change to the population as it happens, with the
// decision that preceded it and who made that decision. This is where the
// judgment becomes legible, because a choice and its consequence sit on one
// line.

import { useEffect, useRef, useState } from 'react'
import type { LogEntry } from '@jev-mice/sim'
import { COLOURS, drawGlyph, type GlyphKind } from './glyphs'

/** Each kind reads as what it happened to, so the column scans by shape. */
const GLYPH: Record<LogEntry['kind'], GlyphKind> = {
  starved: 'mouseFaint',
  eaten: 'cat',
  trapped: 'trap',
  born: 'mouse',
  mated: 'mouse',
  cat_left: 'catHungry',
  birth_lost: 'mouseFaint',
}

const TINT: Record<LogEntry['kind'], string> = {
  starved: COLOURS.mouseFaint,
  eaten: COLOURS.cat,
  trapped: COLOURS.trap,
  born: COLOURS.food,
  mated: COLOURS.mouse,
  cat_left: COLOURS.catHungry,
  birth_lost: COLOURS.hole,
}

const MARK = 12

function Mark({ kind }: { kind: LogEntry['kind'] }): React.ReactElement {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = MARK * dpr
    canvas.height = MARK * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, MARK, MARK)
    drawGlyph(ctx, GLYPH[kind], 0, 0, MARK, TINT[kind])
  }, [kind])
  return (
    <canvas
      ref={ref}
      style={{ width: MARK, height: MARK }}
      className="mt-[3px] shrink-0"
      aria-hidden="true"
    />
  )
}

export function Log({ entries, decidedBy }: {
  entries: readonly LogEntry[]
  decidedBy: 'jev' | 'rules'
}): React.ReactElement {
  const box = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)

  // Follows the newest line, unless the reader has scrolled up to look at
  // something, in which case it stays where they put it.
  useEffect(() => {
    const el = box.current
    if (!el || !pinned) return
    el.scrollTop = el.scrollHeight
  }, [entries, pinned])

  return (
    <section className="mt-4 flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          As it happens
        </h2>
        {!pinned && (
          <button
            type="button"
            onClick={() => { setPinned(true) }}
            className="text-[11px] text-sky-400 hover:text-sky-300 hover:underline"
          >
            Follow the newest
          </button>
        )}
      </div>

      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 24)
        }}
        role="log"
        aria-live="polite"
        aria-label="Population changes as they happen"
        className="mt-1.5 min-h-24 flex-1 overflow-y-auto rounded border border-zinc-800
                   bg-zinc-950/60 p-2"
      >
        {entries.length === 0
          ? <p className="text-xs text-zinc-600">
              Nothing has changed the population yet. Deaths, births and a cat
              giving up on the area all appear here.
            </p>
          : <ol className="space-y-1">
              {entries.map((e, i) => (
                <li key={`${String(e.tick)}-${e.subject}-${e.kind}-${String(i)}`}
                    className="flex gap-2 text-xs leading-snug">
                  <Mark kind={e.kind} />
                  <span className="min-w-0">
                    <span className="tabular-nums text-zinc-600">{e.tick}</span>
                    {' '}
                    <span className="text-zinc-300">{e.text}</span>
                    {e.decision !== undefined && (
                      <span className="text-zinc-500">
                        {' '}It was set to {e.decision}
                        {e.decidedBy === 'jev' ? ', judged by Jev' : ', by the rules'}.
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>}
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">
        Decisions in this run come from {decidedBy === 'jev' ? 'Jev' : 'the fixed rules'}.
      </p>
    </section>
  )
}
