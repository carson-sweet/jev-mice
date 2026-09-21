// Video-player controls for a simulation, in the order a video player puts
// them: to the start, back one, play or pause, forward one, to the end.
//
// Nothing here appears or disappears. Every button is always rendered and the
// frame label is zero-padded, so no control moves under the pointer when the
// state changes. What a button does is said in its tooltip, which costs no
// layout, and the state is in the buttons themselves rather than in a word
// beside them: the middle button shows play or pause, and a run that is over
// has all of them disabled.

import { pad } from './playhead'

export interface TransportState {
  playing: boolean
  over: boolean
  live: boolean
  /** Frames held, and which of them is being shown. */
  buffered: number
  index: number
  /** The turn on screen, and the last turn this run will reach. */
  tick: number
  totalTicks: number
}

export interface TransportActions {
  play: () => void
  pause: () => void
  stop: () => void
  toStart: () => void
  stepBack: () => void
  stepForward: () => void
  toEnd: () => void
  seek: (index: number) => void
}

const BTN = 'flex h-7 w-8 shrink-0 items-center justify-center rounded border '
  + 'border-zinc-700 text-zinc-200 hover:border-zinc-500 focus-visible:outline-none '
  + 'focus-visible:ring-1 focus-visible:ring-sky-500 disabled:cursor-not-allowed '
  + 'disabled:border-zinc-800 disabled:text-zinc-600'

function Icon({ d }: { d: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  )
}

// A bar and two triangles for the ends, one triangle and a bar for a step, so
// "all the way" and "one at a time" are told apart at a glance.
const TO_START = 'M2 3h1.7v10H2zM10 3v10L4.8 8zM15 3v10L9.8 8z'
const STEP_BACK = 'M3.3 3h1.9v10H3.3zM12.8 3v10L6.5 8z'
const PLAY = 'M4.8 2.8v10.4L13.2 8z'
const PAUSE = 'M4.2 2.8h3.1v10.4H4.2zM8.7 2.8h3.1v10.4H8.7z'
const STEP_FORWARD = 'M3.2 3v10L9.5 8zM10.8 3h1.9v10h-1.9z'
const TO_END = 'M14 3h-1.7v10H14zM6 3v10l5.2-5zM1 3v10l5.2-5z'
const STOP = 'M3.6 3.6h8.8v8.8H3.6z'

export function Transport({ state, actions }: {
  state: TransportState
  actions: TransportActions
}): React.ReactElement {
  const { playing, over, live, buffered, index, tick, totalTicks } = state
  const nothing = buffered === 0
  const atStart = nothing || index <= 0
  const atEnd = nothing || live

  return (
    <div className={`flex items-center gap-3 ${over && live ? 'opacity-50' : ''}`}
         title={over && live ? 'This run has finished. Scrub back to look at it again.' : undefined}>
      <div className="flex items-center gap-1" role="group" aria-label="Playback">
        <button type="button" className={BTN} disabled={atStart}
                title="To the first frame held" aria-label="To the start"
                onClick={actions.toStart}>
          <Icon d={TO_START} />
        </button>
        <button type="button" className={BTN} disabled={atStart}
                title="Back one frame" aria-label="Step back"
                onClick={actions.stepBack}>
          <Icon d={STEP_BACK} />
        </button>
        <button
          type="button"
          className={BTN}
          disabled={over && live}
          title={playing && live ? 'Pause' : live ? 'Play' : 'Play from the newest frame'}
          aria-label={playing && live ? 'Pause' : 'Play'}
          aria-pressed={playing && live}
          onClick={playing && live ? actions.pause : actions.play}
        >
          <Icon d={playing && live ? PAUSE : PLAY} />
        </button>
        <button type="button" className={BTN} disabled={over && live}
                title={live ? 'Advance one turn' : 'Forward one frame'}
                aria-label="Step forward" onClick={actions.stepForward}>
          <Icon d={STEP_FORWARD} />
        </button>
        <button type="button" className={BTN} disabled={atEnd}
                title="To the newest frame, and follow along" aria-label="To the end"
                onClick={actions.toEnd}>
          <Icon d={TO_END} />
        </button>
        <button type="button" className={`${BTN} ml-2`} disabled={over}
                title="End this run" aria-label="Stop the run" onClick={actions.stop}>
          <Icon d={STOP} />
        </button>
      </div>

      <label className="flex min-w-0 items-center gap-2">
        <span className="sr-only">Scrub through the frames held</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, buffered - 1)}
          value={Math.max(0, index)}
          disabled={buffered <= 1}
          aria-label="Scrub through the frames held"
          aria-valuetext={`turn ${String(tick)}`}
          onChange={(e) => { actions.seek(Number(e.target.value)) }}
          className="w-40 accent-sky-500 disabled:opacity-40"
        />
      </label>

      {/* Only whether the view is live or scrubbed back. The turn itself is in
          the header now, and having it in both places meant reading "turn 2,407
          of 4,000 finished" beside "turn 02407 of 04000 live", which disagreed
          with itself about both the formatting and the state. */}
      <span
        className={`shrink-0 whitespace-nowrap font-mono text-[11px] ${
          live ? 'text-zinc-600' : 'text-amber-400'}`}
        title={live ? 'Showing the newest frame' : `Scrubbed back to turn ${String(tick)}`}
      >
        {live ? 'live' : `back at ${pad(tick)}`}
      </span>
    </div>
  )
}
