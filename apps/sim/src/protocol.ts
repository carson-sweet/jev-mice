// The shapes that cross the wire between a host and a browser.
//
// The viewer hand-declared all of these, duplicating the host, and the two met
// only at a JSON boundary typed by a generic cast. A field renamed on the host
// simply stopped appearing in the browser with no compile error. They live here
// because both sides already depend on this package and neither depends on the
// other.

import type { RunConfig } from '@jev-mice/engine'
import type { ChunkReport, EndReason, Extent, Frame, LogEntry } from './types.js'

export type RunStatus =
  'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type Decider = 'jev' | 'rules'

export interface RunSummary {
  id: string
  status: RunStatus
  createdAt: string
  seed: number
  config: RunConfig
  currentTick: number
  queuePosition: number | null
  chunks: { seq: number; firstTick: number; lastTick: number; bytesGzip: number }[]
  totals: ChunkReport['totals']
  error: string | null
  decidedBy: Decider
  /** Ticks a second this run is paced at. */
  speed: number
  /** Highest, lowest and latest, over the whole run. */
  population: { mice: Extent; cats: Extent }
  /** Why it finished, once it has. */
  endReason: EndReason | null
}

/**
 * One decision, reduced for the DECISIONS tab: what was asked and what came
 * back. Reduced rather than passed through because a subject's full state is
 * about a kilobyte and this travels on every flush.
 */
export interface DecisionLine {
  /** The event's own sequence number, monotonic across the run. */
  seq: number
  tick: number
  /** Who answered. A fallback says 'baseline' and carries a reason. */
  source: 'jev' | 'baseline'
  latencyMs: number
  model?: string
  inputTokens?: number
  /** Present only when a batch meant for Jev was answered by the rules. */
  fallback?: 'timeout' | 'error' | 'quota' | 'disabled'
  subjects: {
    agentId: string
    /** One line of what it was asked, from situationLine. */
    situation: string
    /** What came back. */
    intent: string
    fear: string
    confidence: number
  }[]
}

export type ViewerMessage =
  | { t: 'hello'; run: RunSummary; frame: Frame | null; log: LogEntry[]
      decisions: DecisionLine[] }
  | { t: 'frame'; frame: Frame }
  | { t: 'log'; entries: LogEntry[] }
  | { t: 'decisions'; entries: DecisionLine[] }
  | { t: 'status'; run: RunSummary }
  | { t: 'error'; message: string }

export interface Capabilities {
  jevAvailable: boolean
  speed: { slowest: number; fastest: number }
}

export interface TurnStats { mice: number; cats: number; food: number; traps: number }

export interface TurnEvent {
  kind: string
  /** A sentence, so a reader need not know the event shapes. */
  text: string
  subject?: string
}

export interface Turn {
  tick: number
  stats: TurnStats
  delta: TurnStats
  events: TurnEvent[]
}

export interface TurnWindow {
  runId: string
  from: number
  to: number
  totalTurns: number
  turns: Turn[]
}
