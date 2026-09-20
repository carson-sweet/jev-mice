// The engine's public surface. Every export here is a declaration the executable
// specifications are written against; none is implemented yet. Each throws, so a
// specification fails because the behaviour is missing rather than because the
// module cannot be found.
//
// Sources: requirements v3.1 (FR-001 to FR-052, FR-069 to FR-074, FR-091 to FR-101)
// and the technical specification v1.1 (tick order, signal fields, the decision
// contract, the code-only rule weights).

const TODO = (what: string): never => {
  throw new Error(`not implemented: ${what}`)
}

// ---------------------------------------------------------------- vocabulary

export type Preset = 'small' | 'medium' | 'large'
export type Sex = 'male' | 'female'
export type Personality = 'bold' | 'cautious' | 'vigilant' | 'social'
export const PERSONALITIES: readonly Personality[] =
  ['bold', 'cautious', 'vigilant', 'social'] as const

export type Drive = 'eat' | 'flee' | 'hide' | 'seek_mate' | 'nest' | 'explore'
export type FearLevel = 'unconcerned' | 'wary' | 'alarmed' | 'panicked'
export type CatMode = 'prowl' | 'stalk' | 'pounce' | 'rest' | 'eating'
export type DeathCause = 'starvation' | 'trap' | 'cat'
export type Provenance = 'seen' | 'heard'
export type Bearing =
  | 'north' | 'northeast' | 'east' | 'southeast'
  | 'south' | 'southwest' | 'west' | 'northwest'

export type AgentId = string
export type Tick = number
export interface Cell { x: number; y: number }

// ------------------------------------------------------------------- config

export interface RunConfig {
  preset: Preset
  ticks: number
  maleMice: number
  femaleMice: number
  cats: number
  traps: number
  foodPiles: number
  mouseholes: number
  foodRespawnTicks: number
  nutritionDecayPerTick: number
  personality: Record<Personality, number>
}

export interface Caps {
  mice: number; food: number; mouseholes: number; traps: number; cats: number
}

export interface ValidationError {
  field: string
  code: 'out_of_range' | 'above_cap' | 'sum_not_100'
  message: string
  cap?: number
}

export const PRESETS: Record<Preset, { width: number; height: number }> = {
  small:  { width: 48,  height: 32 },
  medium: { width: 80,  height: 50 },
  large:  { width: 120, height: 75 },
}

export function capsFor(_preset: Preset): Caps { return TODO('capsFor') }
export function validateConfig(_c: RunConfig): ValidationError[] { return TODO('validateConfig') }
export function defaultConfig(_preset: Preset): RunConfig { return TODO('defaultConfig') }

// ---------------------------------------------------------------------- rng

export type RngState = readonly [number, number, number, number]
export interface Rng {
  next(): number
  state(): RngState
  restore(s: RngState): void
}
export function createRng(_seed: number): Rng { return TODO('createRng') }

// -------------------------------------------------------------------- events

export interface EventBase { tick: Tick; seq: number }
export type SimEvent =
  | (EventBase & { kind: 'run_started'; config: RunConfig; seed: number; engineVersion: string })
  | (EventBase & { kind: 'mouse_spawned'; id: AgentId; sex: Sex; personality: Personality })
  | (EventBase & { kind: 'run_resumed'; fromTick: Tick; attempt: number })
  | (EventBase & { kind: 'tick_advanced'; population: number })
  | (EventBase & { kind: 'moved'; id: AgentId; from: Cell; to: Cell })
  | (EventBase & { kind: 'decision_requested'; batchId: string; agents: AgentId[] })
  | (EventBase & { kind: 'decision_returned'; batchId: string; source: 'jev' | 'baseline'
                   latencyMs: number; model?: string; inputTokens?: number
                   subjects: DecisionSubject[] })
  | (EventBase & { kind: 'decision_fallback'; batchId: string
                   reason: 'timeout' | 'error' | 'quota' | 'disabled' })
  | (EventBase & { kind: 'food_eaten'; id: AgentId; foodId: string })
  | (EventBase & { kind: 'food_respawned'; foodId: string; at: Cell })
  | (EventBase & { kind: 'trap_entered'; id: AgentId; trapId: string })
  | (EventBase & { kind: 'evasion_rolled'; id: AgentId; trapId: string
                   nutrition: number; chance: number; evaded: boolean })
  | (EventBase & { kind: 'mouse_trapped'; id: AgentId; trapId: string })
  | (EventBase & { kind: 'trap_respawned'; trapId: string; at: Cell })
  | (EventBase & { kind: 'hole_entered'; id: AgentId; holeId: string; as: 'adult' | 'brood' })
  | (EventBase & { kind: 'hole_left'; id: AgentId; holeId: string })
  | (EventBase & { kind: 'brood_born'; holeId: string; motherId: AgentId; pups: AgentId[] })
  | (EventBase & { kind: 'hole_freed'; holeId: string })
  | (EventBase & { kind: 'cat_targeted'; id: AgentId; target: AgentId | null; mode: CatMode })
  | (EventBase & { kind: 'cat_pounced'; id: AgentId; target: AgentId; from: Cell; to: Cell })
  | (EventBase & { kind: 'capture'; catId: AgentId; mouseId: AgentId })
  | (EventBase & { kind: 'cat_eating_started'; id: AgentId })
  | (EventBase & { kind: 'cat_eating_ended'; id: AgentId })
  | (EventBase & { kind: 'mating'; a: AgentId; b: AgentId; holeId: string })
  | (EventBase & { kind: 'gestation_started'; id: AgentId })
  | (EventBase & { kind: 'birth'; motherId: AgentId; pupId: AgentId
                   personality: Personality; sex: Sex })
  | (EventBase & { kind: 'cap_limited_birth'; motherId: AgentId; lost: number })
  | (EventBase & { kind: 'death'; id: AgentId; cause: DeathCause })
  | (EventBase & { kind: 'memory_added'; id: AgentId; sentence: string
                   provenance: Provenance; bearing: Bearing })
  | (EventBase & { kind: 'alarm_exchanged'; from: AgentId; to: AgentId; sentence: string })
  | (EventBase & { kind: 'run_ended'; reason: 'completed' | 'cancelled' | 'failed'; finalTick: Tick })

/** Fields excluded from stream comparison because they record duration, not outcome. */
export const WALL_CLOCK_FIELDS: readonly string[] = ['latencyMs'] as const

// ------------------------------------------------------------ decisions

export type QuestionId =
  | 'drive' | 'fear' | 'approach_suspect_food' | 'mate_choice' | 'nest_site'
  | 'target' | 'mode'

export interface DecisionSubject {
  agentId: AgentId
  state: Record<string, unknown>
  questions: Record<string, unknown>
  answers: Record<string, AnswerPayload>
  intent: Drive
  lowConfidence: boolean
  fear: FearLevel
  weights: Record<string, number>
}

export type AnswerPayload =
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; probabilities: Record<string, number>; confidence: number }
  | { type: 'noul'; noul: number }

export interface DecisionRequest {
  batchId: string
  state: Record<string, unknown>
  questions: Record<string, unknown>
  agents: AgentId[]
}

export interface DecisionProvider {
  decide(requests: DecisionRequest[]): Promise<Record<string, DecisionSubject[]>>
}

export function bucketNutrition(_pct: number): string { return TODO('bucketNutrition') }
export function bucketDistance(_cells: number): string { return TODO('bucketDistance') }
export function bucketAge(_ticks: number): string { return TODO('bucketAge') }
export function composeRequests(_world: WorldView, _ready: AgentId[]): DecisionRequest[] {
  return TODO('composeRequests')
}
export function baselineProvider(): DecisionProvider { return TODO('baselineProvider') }

// -------------------------------------------------------------------- world

export interface MouseView {
  id: AgentId; sex: Sex; personality: Personality
  nutrition: number; age: Tick; at: Cell
  inHole: string | null; intent: Drive | null
  memories: { sentence: string; provenance: Provenance; addedAt: Tick }[]
  pregnantSince: Tick | null
}
export interface CatView {
  id: AgentId; at: Cell; mode: CatMode; target: AgentId | null
  pounceCooldown: number; patience: number; lastSighting: Cell | null
}
export interface WorldView {
  tick: Tick
  width: number; height: number
  mice: MouseView[]; cats: CatView[]
  food: { id: string; at: Cell; present: boolean }[]
  traps: { id: string; at: Cell; occupantId: AgentId | null }[]
  holes: { id: string; at: Cell; occupancy: 'empty' | 'adult' | 'brood' }[]
}

// ------------------------------------------------------------------- engine

export interface EngineOptions {
  config: RunConfig
  seed: number
  provider: DecisionProvider
}

export interface Snapshot { version: 1; tick: Tick; [k: string]: unknown }

export interface Engine {
  step(): Promise<void>
  run(ticks: number): Promise<void>
  world(): WorldView
  events(): readonly SimEvent[]
  drain(): SimEvent[]
  serialize(): Snapshot
  candidateScores(id: AgentId): { cell: Cell; danger: number; food: number
                                  shelter: number; mate: number; explore: number }[]
}

export function createEngine(_o: EngineOptions): Engine { return TODO('createEngine') }
export function restore(_s: Snapshot, _o: Omit<EngineOptions, 'config' | 'seed'>): Engine {
  return TODO('restore')
}

// ------------------------------------------------------------------ metrics

export interface Metric {
  applies: boolean; threshold: number
  [k: string]: unknown
}
export function fleeOrHideRate(_events: AsyncIterable<SimEvent[]>): Promise<Metric> {
  return TODO('fleeOrHideRate')
}
export function personalityMix(
  _events: AsyncIterable<SimEvent[]>, _c: RunConfig): Promise<Metric> {
  return TODO('personalityMix')
}
