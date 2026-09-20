// The private contract between a simulation process and whatever coordinates
// it. Nothing here knows about HTTP, so the same process runs behind a Durable
// Object in the deployment and behind a local server on a laptop.

import type { RunConfig, SimEvent, Snapshot } from '@jev-mice/engine'

export type Desired = 'run' | 'pause' | 'step' | 'stop'

export interface Control {
  desired: Desired
  /** Ticks a second, as a multiple of thirty. Zero runs as fast as it can. */
  speed: number
  seq: number
}

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
  totals: { currentTick: number; requests: number; inputTokens: number; fallbackCount: number }
}

/** What a viewer draws. Positions only, small enough to send every few ticks. */
export interface Frame {
  tick: number
  population: number
  mice: { id: string; x: number; y: number; nutrition: number; intent: string | null
          fear: string; inHole: boolean }[]
  cats: { id: string; x: number; y: number; mode: string
          nutrition: number; hungry: boolean }[]
  food: { id: string; x: number; y: number }[]
  traps: { id: string; x: number; y: number; occupied: boolean }[]
  holes: { id: string; x: number; y: number; occupancy: string }[]
}

/** One tick's worth of the series the charts draw, appended per chunk. */
export interface SummaryPoint {
  tick: number
  population: number
  births: number
  deathsByStarvation: number
  deathsByTrap: number
  deathsByCat: number
  meanNutrition: number
  judged: number
  fallbacks: number
}

export interface Coordinator {
  ready(info: { engineVersion: string; pid: number; resumedFromTick?: number }): Promise<ChunkAck>
  chunk(report: ChunkReport): Promise<ChunkAck>
  frames(frames: Frame[]): Promise<void>
  done(d: { finalTick: number; totals: ChunkReport['totals'] }): Promise<void>
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
}

export interface Simulation {
  start(o?: { snapshot?: Snapshot }): Promise<void>
  control(c: Control): void
  currentTick(): number
}
