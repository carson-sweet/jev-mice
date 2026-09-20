// The running log: every change to the population as it happens, with the
// decision that preceded it and who made that decision. This is where the
// judgment becomes legible, because a choice and its consequence sit on one
// line.

import { useEffect, useRef, useState } from 'react'
import type { LogEntry } from '@jev-mice/sim'
import { COLOURS, type GlyphKind } from './glyphs'
import { glyphUrl } from './glyphCache'
import { useDevicePixelRatio } from './dpr'

/** Each kind reads as what it happened to, so the column scans by shape. */
const GLYPH: Record<LogEntry['kind'], GlyphKind> = {
  starved: 'mouseHungry',
  eaten: 'cat',
  trapped: 'trap',
  born: 'mouse',
  mated: 'mouse',
  cat_starved: 'catHungry',
  birth_lost: 'mouseHungry',
}

const TINT: Record<LogEntry['kind'], string> = {
  starved: COLOURS.mouse,
  eaten: COLOURS.cat,
  trapped: COLOURS.trap,
  born: COLOURS.food,
  mated: COLOURS.mouse,
  cat_starved: COLOURS.catHungry,
  birth_lost: COLOURS.hole,
}

const MARK = 12

/**
 * An image, not a canvas. There are seven kinds of mark and up to four hundred
 * lines, and a canvas per line meant four hundred 2D contexts holding native
 * and GPU memory that the JS heap never showed -- the tab died at a flat six
 * megabytes with no error. The glyph is drawn once per kind and shown here.
 */
function Mark({ kind }: { kind: LogEntry['kind'] }): React.ReactElement {
  const dpr = useDevicePixelRatio()
  return (
    <img
      src={glyphUrl(GLYPH[kind], MARK, dpr, TINT[kind])}
      width={MARK}
      height={MARK}
      className="mt-[3px] shrink-0"
      alt=""
      aria-hidden="true"
    />
  )
}

/** Every id a line mentions, so hovering it can point at all of them. */
function subjectsOf(e: LogEntry): string[] {
  const ids = e.text.match(/\b[mctfh]\d{4}\b/g) ?? []
  return [...new Set([e.subject, ...ids])]
}

export function Log({ entries, decidedBy, onHover }: {
  entries: readonly LogEntry[]
  decidedBy: 'jev' | 'rules'
  /** Called with the ids a line is about, and with nothing on leaving it. */
  onHover?: (ids: readonly string[]) => void
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
              {entries.map((e) => (
                <li key={e.seq}
                    onMouseEnter={() => { onHover?.(subjectsOf(e)) }}
                    onMouseLeave={() => { onHover?.([]) }}
                    className="flex gap-2 rounded px-1 text-xs leading-snug
                               hover:bg-zinc-800/60">
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
