// Every shared type in the engine. Kept in one file because the browser client,
// the coordinator and the simulation process all import from here and none of
// them should have to reach into an implementation module.

export type Preset = 'small' | 'medium' | 'large'
export type Sex = 'male' | 'female'
export type Personality = 'bold' | 'cautious' | 'vigilant' | 'social'
export const PERSONALITIES: readonly Personality[] =
  ['bold', 'cautious', 'vigilant', 'social'] as const

export type Drive = 'eat' | 'flee' | 'hide' | 'seek_mate' | 'nest' | 'explore'
export const DRIVES: readonly Drive[] =
  ['eat', 'flee', 'hide', 'seek_mate', 'nest', 'explore'] as const

export type FearLevel = 'unconcerned' | 'wary' | 'alarmed' | 'panicked'
export const FEAR_LEVELS: readonly FearLevel[] =
  ['unconcerned', 'wary', 'alarmed', 'panicked'] as const

export type CatMode = 'prowl' | 'stalk' | 'pounce' | 'rest' | 'eating'
export type DeathCause = 'starvation' | 'trap' | 'cat'
export type Provenance = 'seen' | 'heard'
export type Bearing =
  | 'north' | 'northeast' | 'east' | 'southeast'
  | 'south' | 'southwest' | 'west' | 'northwest'

export type AgentId = string
export type Tick = number
export interface Cell { x: number; y: number }

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
  /** Where every mouse starts. Defaults to 100; lowered for experiments and tests. */
  startingNutrition?: number
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

export interface Memory {
  sentence: string
  provenance: Provenance
  addedAt: Tick
  bearing: Bearing
  at: Cell
  kind: 'trap_death' | 'cat_kill' | 'narrow_escape'
}

export interface MouseView {
  id: AgentId; sex: Sex; personality: Personality
  nutrition: number; age: Tick; at: Cell
  inHole: string | null; intent: Drive | null
  memories: Memory[]
  pregnantSince: Tick | null
  fear: FearLevel
}

export interface CatView {
  id: AgentId; at: Cell; mode: CatMode; target: AgentId | null
  pounceCooldown: number; patience: number; lastSighting: Cell | null
}

export interface FoodView { id: string; at: Cell; present: boolean }
export interface TrapView { id: string; at: Cell; occupantId: AgentId | null }
export interface HoleView { id: string; at: Cell; occupancy: 'empty' | 'adult' | 'brood' }

export interface WorldView {
  tick: Tick
  width: number; height: number
  mice: MouseView[]; cats: CatView[]
  food: FoodView[]; traps: TrapView[]; holes: HoleView[]
}

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
  | (EventBase & { kind: 'alarm_exchanged'; from: AgentId; to: AgentId; sentence: string
                   /** How the sender held it. Only 'seen' may be shared; this makes that checkable. */
                   senderProvenance: Provenance })
  | (EventBase & { kind: 'run_ended'; reason: 'completed' | 'cancelled' | 'failed'; finalTick: Tick })

/** Excluded from stream comparison: these record duration, not outcome. */
export const WALL_CLOCK_FIELDS: readonly string[] = ['latencyMs'] as const

export type AnswerPayload =
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; probabilities: Record<string, number>; confidence: number }
  | { type: 'noul'; noul: number }

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

export interface DecisionRequest {
  batchId: string
  /** Exactly what a decision model is sent: words only, never a number. */
  state: Record<string, unknown>
  questions: Record<string, unknown>
  agents: AgentId[]
  /**
   * The structured view the code-only rules read. It never leaves the process
   * and is not part of what a model receives, which is why it sits beside the
   * state rather than inside it.
   */
  contexts?: Record<string, unknown>
}

export interface DecisionProvider {
  decide(requests: DecisionRequest[]): Promise<Record<string, DecisionSubject[]>>
}

export interface CandidateScore {
  cell: Cell
  danger: number; food: number; shelter: number; mate: number; explore: number
  total: number
}

export interface Snapshot { version: 1; tick: Tick; [k: string]: unknown }

export interface Metric { applies: boolean; threshold: number; [k: string]: unknown }

/** Every tick cost the requirements fix, in one place. */
export const TIMING = {
  moveFed: 1, moveHungry: 2, moveStarving: 3,
  eat: 3, catEat: 10, trapOccupied: 10,
  mate: 5, gestation: 60, birth: 5, juvenile: 30,
  catRest: 10, catPatience: 30, catReturnToSighting: 30, pounceCooldown: 20,
  memoryLifetime: 300, intentHold: 12, intentHoldPanicked: 6,
} as const

export const PERCEPTION = { mouse: 6, vigilantMouse: 8, cat: 8 } as const
export const ALARM_RANGE = { normal: 1, social: 2 } as const
export const NUTRITION_BANDS = { fed: 60, hungry: 30 } as const
export const PUP_NUTRITION = 75
export const JITTER = 0.05
export const BATCH_SIZE = 8
export const ENGINE_VERSION = '0.1.0'

export const PERSONALITY_TEXT: Record<Personality, string> = {
  bold: 'Bold: approaches food despite nearby danger, explores far from shelter, and is slow to flee.',
  cautious: 'Cautious: flees early, avoids any place it remembers as dangerous, and prefers to forage near where it has eaten before.',
  vigilant: 'Vigilant: notices danger sooner than other mice and readily warns the ones it meets.',
  social: 'Social: seeks out other mice, shares what it has seen readily, and looks for a mate as soon as it is able.',
}
