// Video-player controls for a running simulation. Play, pause, stop, and steps
// and scans in both directions.
//
// Forward is the simulation advancing. Backward is the frames already received:
// the engine only runs forwards, so stepping back moves a playhead through what
// this page has already seen rather than asking the server to un-run a turn.

export interface TransportState {
  playing: boolean
  over: boolean
  /** How far back from the newest frame the playhead is, in frames. */
  behind: number
  /** How many frames are held to scan back through. */
  buffered: number
}

export interface TransportActions {
  play: () => void
  pause: () => void
  stop: () => void
  stepBack: () => void
  stepForward: () => void
  scanBack: () => void
  scanForward: () => void
  live: () => void
}

const BTN = 'flex h-7 w-7 items-center justify-center rounded border border-zinc-700 '
  + 'text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed '
  + 'disabled:border-zinc-800 disabled:text-zinc-600'

function Icon({ d, mirrored = false }: { d: string; mirrored?: boolean }): React.ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"
         style={mirrored ? { transform: 'scaleX(-1)' } : undefined}>
      <path d={d} fill="currentColor" />
    </svg>
  )
}

const PLAY = 'M4.5 2.7v10.6L13 8z'
const PAUSE = 'M4 2.8h3v10.4H4zM9 2.8h3v10.4H9z'
const STOP = 'M3.4 3.4h9.2v9.2H3.4z'
const SCAN = 'M7.6 3.2v9.6L1.8 8zM14.2 3.2v9.6L8.4 8z'
const STEP = 'M5.4 3.2v9.6L11.2 8zM12 3.2h1.9v9.6H12z'

export function Transport({ state, actions }: {
  state: TransportState
  actions: TransportActions
}): React.ReactElement {
  const { playing, over, behind, buffered } = state
  const scanning = behind > 0

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Playback">
      <button type="button" className={BTN} title="Scan back"
              aria-label="Scan back" disabled={buffered <= 1}
              onClick={actions.scanBack}>
        <Icon d={SCAN} mirrored />
      </button>
      <button type="button" className={BTN} title="Step back one frame"
              aria-label="Step back" disabled={behind >= buffered - 1 || buffered <= 1}
              onClick={actions.stepBack}>
        <Icon d={STEP} mirrored />
      </button>

      {playing && !scanning
        ? <button type="button" className={BTN} title="Pause" aria-label="Pause"
                  disabled={over} onClick={actions.pause}>
            <Icon d={PAUSE} />
          </button>
        : <button type="button" className={BTN} title={scanning ? 'Return to live' : 'Play'}
                  aria-label={scanning ? 'Return to live' : 'Play'} disabled={over}
                  onClick={scanning ? actions.live : actions.play}>
            <Icon d={PLAY} />
          </button>}

      <button type="button" className={BTN} title="Step forward one turn"
              aria-label="Step forward" disabled={over && behind === 0}
              onClick={actions.stepForward}>
        <Icon d={STEP} />
      </button>
      <button type="button" className={BTN} title="Scan forward"
              aria-label="Scan forward" disabled={behind === 0}
              onClick={actions.scanForward}>
        <Icon d={SCAN} />
      </button>
      <button type="button" className={BTN} title="Stop the run"
              aria-label="Stop" disabled={over} onClick={actions.stop}>
        <Icon d={STOP} />
      </button>

      {scanning && (
        <button
          type="button"
          onClick={actions.live}
          className="ml-1 rounded bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-300
                     hover:bg-amber-500/25"
        >
          {behind} frame{behind === 1 ? '' : 's'} back, return to live
        </button>
      )}
    </div>
  )
}
