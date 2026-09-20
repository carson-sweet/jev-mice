// The running log: every change to the population as it happens, with the
// decision that preceded it and who made that decision. This is where the
// judgment becomes legible, because a choice and its consequence sit on one
// line.

import { memo, useEffect, useRef, useState } from 'react'
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
function Mark({ kind, dpr }: {
  kind: LogEntry['kind']
  /**
   * Passed in, not read here. This hook registers a matchMedia listener, and
   * the log has four hundred rows: reading it per row meant four hundred media
   * queries and four hundred listeners, torn down and rebuilt every time the
   * list changed. The panel reads it once.
   */
  dpr: number
}): React.ReactElement {
  return (
    <img
      src={glyphUrl(GLYPH[kind], MARK, dpr, TINT[kind])}
      // Both the explicit size and self-start are load-bearing. A flex row
      // stretches its items to the row's height by default, and an img with no
      // CSS size obeys that: the marks came out 12 by 30. The canvas this
      // replaced carried the same explicit style for the same reason.
      style={{ width: MARK, height: MARK }}
      className="mt-[3px] shrink-0 self-start"
      alt=""
      aria-hidden="true"
    />
  )
}

/**
 * One line, memoised.
 *
 * Without this every batch of events re-rendered all four hundred lines,
 * because appending to the list produces a new array and React re-runs each
 * child. Measured at the fastest pace: 858 ms of the main thread blocked out
 * of six seconds, with a worst task of 98 ms, which is what made turning the
 * speed up feel like slowing down. The entries themselves are never mutated,
 * so comparing by reference is enough to skip a line that has not changed.
 */
const Row = memo(function Row({ entry, dpr, onHover }: {
  entry: LogEntry
  dpr: number
  onHover: ((ids: readonly string[]) => void) | undefined
}): React.ReactElement {
  return (
    <li
      onMouseEnter={() => { onHover?.(subjectsOf(entry)) }}
      onMouseLeave={() => { onHover?.([]) }}
      className="flex gap-2 rounded px-1 text-xs leading-snug hover:bg-zinc-800/60"
    >
      <Mark kind={entry.kind} dpr={dpr} />
      <span className="min-w-0">
        <span className="tabular-nums text-zinc-600">{entry.tick}</span>
        {' '}
        <span className="text-zinc-300">{entry.text}</span>
        {entry.decision !== undefined && (
          <span className="text-zinc-500">
            {' '}It was set to {entry.decision}
            {entry.decidedBy === 'jev' ? ', judged by Jev' : ', by the rules'}.
          </span>
        )}
      </span>
    </li>
  )
})

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
  const dpr = useDevicePixelRatio()

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
                <Row key={e.seq} entry={e} dpr={dpr} onHover={onHover} />
              ))}
            </ol>}
      </div>
      <p className="mt-1 text-[11px] text-zinc-600">
        Decisions in this run come from {decidedBy === 'jev' ? 'Jev' : 'the fixed rules'}.
      </p>
    </section>
  )
}
