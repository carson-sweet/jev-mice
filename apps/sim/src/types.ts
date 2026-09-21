// The private contract between a simulation process and whatever coordinates
// it. Nothing here knows about HTTP, so the same process runs behind a Durable
// Object in the deployment and behind a local server on a laptop.

import type { RunConfig, SimEvent, Snapshot } from '@jev-mice/engine'
import type { DecisionLine } from './protocol.js'

export type Desired = 'run' | 'pause' | 'step' | 'stop'
/** Why a run finished. Extinction is the engine stopping itself. */
export type EndReason = 'completed' | 'extinct' | 'stopped'

export interface Control {
  desired: Desired
  /** Ticks a second. Zero runs as fast as the machine allows. */
  speed: number
  seq: number
}

/** The slowest and fastest a run may be paced at, in ticks a second. */
export const SPEED = {
  slowest: 1,
  /** A full-length run in about a minute, which is as fast as is worth watching. */
  fastest: 334,
} as const

export interface Extent { peak: number; min: number; current: number }

export interface Allowance {
  tokens: number
  degraded: boolean
  reason?: 'quota' | 'address_quota' | 'global_budget' | 'disabled'
}

export interface ChunkAck {
  control: Control
  allowance: Allowance
  rate: { requestsPerMinute: number }
  presigned: { chunk: string; summary: string; snapshot: string; expiresAt: string }
}

export interface ChunkReport {
  seq: number
  firstTick: number
  lastTick: number
  eventCount: number
  bytesRaw: number
  bytesGzip: number
  usage: { requests: number; inputTokens: number; fallbacks: number; model: string | null }
  totals: {
    currentTick: number; requests: number; inputTokens: number; fallbackCount: number
    /** Highest, lowest and latest seen since the run began, not since this chunk. */
    population: { mice: Extent; cats: Extent }
  }
}

/** What a viewer draws. Positions only, small enough to send every few ticks. */
export interface Frame {
  tick: number
  population: number
  mice: { id: string; x: number; y: number; nutrition: number; intent: string | null
          fear: string; inHole: boolean
          /** Below the fed band, by the engine's own reckoning. */
          hungry: boolean
          /** Carrying toxoplasmosis. Permanent. */
          infected: boolean }[]
  cats: { id: string; x: number; y: number; mode: string
          nutrition: number; hungry: boolean
          /** Passing oocysts into the environment. */
          shedding: boolean }[]
  food: { id: string; x: number; y: number }[]
  traps: { id: string; x: number; y: number; occupied: boolean }[]
  holes: { id: string; x: number; y: number; occupancy: string }[]
}

/** One tick's worth of the series the charts draw, appended per chunk. */
export interface SummaryPoint {
  tick: number
  population: number
  cats: number
  /** Piles present, and traps not holding a body. Deltas are read from these. */
  food: number
  traps: number
  births: number
  deathsByStarvation: number
  deathsByTrap: number
  deathsByCat: number
  meanNutrition: number
  judged: number
  fallbacks: number
}

/**
 * One line of the running log. Only what changes the population appears, with
 * the decision that preceded it and who made that decision, so a consequence
 * and its judgment are read together. The sentence is composed here rather than
 * in the page, for the same reason a mouse's memories are.
 */
export interface LogEntry {
  /**
   * The sequence number of the event this line came from, which is monotonic
   * across the run. The viewer keys its rows by it. Keying by array index
   * meant that trimming the oldest line shifted every index, so every key
   * changed and the whole list remounted on each batch.
   */
  seq: number
  tick: number
  kind: 'starved' | 'eaten' | 'trapped' | 'born' | 'mated' | 'cat_starved' | 'birth_lost'
  subject: string
  text: string
  /** The intent the subject last held, when one is known. */
  decision?: string
  /** Who chose it: the decision service, or the fixed rules. */
  decidedBy?: 'jev' | 'baseline'
}

export interface Coordinator {
  ready(info: { engineVersion: string; pid: number; resumedFromTick?: number }): Promise<ChunkAck>
  chunk(report: ChunkReport): Promise<ChunkAck>
  /** Frames, log lines and decisions travel together, on the same flush. */
  frames(frames: Frame[], log: LogEntry[], decisions?: DecisionLine[]): Promise<void>
  done(d: {
    finalTick: number; totals: ChunkReport['totals']; reason: EndReason
  }): Promise<void>
  failed(f: { atTick: number; reason: string; detail?: string }): Promise<void>
}

export interface ChunkBody {
  runId: string
  seq: number
  firstTick: number
  lastTick: number
  events: SimEvent[]
}

export interface SummaryBody {
  runId: string
  seq: number
  points: SummaryPoint[]
}

export interface SimulationOptions {
  runId: string
  config: RunConfig
  seed: number
  coordinator: Coordinator
  upload: (url: string, body: Uint8Array) => Promise<void>
  /** Rebuilt whenever the allowance changes, so a withdrawn budget takes effect. */
  provider: (o: Allowance) => import('@jev-mice/engine').DecisionProvider
  /** Pacing only. Overridden in tests; the engine never reads a clock. */
  now?: () => number
  /**
   * Called once with the engine this run drives. The coordinator protocol needs
   * a run's current world state on demand, to answer a viewer joining between
   * chunk boundaries, and this is the handle for it.
   */
  onEngine?: (engine: import('@jev-mice/engine').Engine) => void
}

/** What one call to start did, so a caller driving batches knows to come back. */
export interface Advanced { finished: boolean; tick: number }

export interface Simulation {
  /**
   * Runs until the configured tick count, or until `until` if that comes first.
   * A ceiling is how the Run Durable Object advances a long run without holding
   * one invocation open for all of it: each call stops on a chunk boundary
   * having written a snapshot, and the next resumes from it.
   */
  start(o?: {
    snapshot?: Snapshot
    until?: number
    /**
     * The run's totals so far, when resuming. A fresh simulation counts from
     * zero, so without these a run advanced in batches reports the population
     * extremes and the Jev usage of its last batch only.
     */
    totals?: ChunkReport['totals']
  }): Promise<Advanced>
  control(c: Control): void
  currentTick(): number
}
