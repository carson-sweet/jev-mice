// The engine's public surface. Everything the browser client, the coordinator
// and the simulation process may import lives here.

export * from './types.js'
export { PRESETS, capsFor, defaultConfig, validateConfig, drawPersonality, TICK_RANGE } from './config.js'
export { createRng, type Rng, type RngState } from './rng.js'
export {
  bucketNutrition, bucketDistance, bucketAge, catStateWord,
  composeRequests, contextFor, availableDrives, spatialOrder,
  baselineProvider, baselineDrive, baselineFear, baselineSubjects, baselineBatch, baselineCat, BLOCK, DANGER_FLOOR,
  type CatContext,
  type MouseContext,
} from './decisions.js'
export {
  chebyshev, FEAR_FACTOR, normalize, NEIGHBOURS,
  foodAt, dangerAt, mateAt, shelterAt, exploreAt, type Sources,
} from './signals.js'
export {
  bearingFrom, whenWord, sentenceFor, addMemory, expireMemories, freshestSeen,
} from './memory.js'
export { createEngine, restore, type Engine, type EngineOptions } from './engine.js'
export {
  DRIVE_CRITERIA, FEAR_RUBRIC, CAT_MODE_CRITERIA, FEAR_FROM_SCORE,
  driveQuestion, fearQuestion, catTargetQuestion, catModeQuestion, catCandidateText,
} from './questions.js'
export {
  narrate, CHANGES_POPULATION, NOT_WORTH_SAYING, type Narration,
} from './narrate.js'
export { fleeOrHideRate, personalityMix } from './metrics.js'
