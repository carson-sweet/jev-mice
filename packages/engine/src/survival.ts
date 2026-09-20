// Reading a chance of survival off the measured grid.
//
// Because the engine is deterministic, the chance an ecosystem lasts a run is
// the fraction of measured seeds whose mice outlived that many turns. Nothing
// here computes anything: it looks up what scripts/survival-sweep.mjs already
// measured and counts. The counting is deliberate -- a count carries its own
// sample size in a way "76%" does not, and the sample is small enough that the
// difference matters.
//
// The lookup refuses far more readily than it interpolates. Cats are a cliff:
// two cats left every seed alive and three killed every seed at the same food
// settings, so a value between measured points is not a smooth blend of them.
// Where the sweep did not measure, this says nothing rather than guessing.

import { PERSONALITIES, type Personality, type Preset, type RunConfig } from './types.js'

export interface SurvivalCell {
  preset: Preset
  cats: number
  mouseholes: number
  foodPiles: number
  foodRespawnTicks: number
  /** Per seed: the turn its last mouse died, or null if it outlived the sweep. */
  diedAt: (number | null)[]
}

export interface SurvivalTable {
  measuredAt: string
  /** How far the sweep ran. Nothing may be claimed beyond it. */
  ticks: number
  seeds: number[]
  held: {
    nutritionDecayPerTick: number
    startingNutrition: number
    personality: Record<Personality, number>
  }
  fixedPerPreset: Record<Preset, { traps: number; maleMice: number; femaleMice: number }>
  axes: Record<'cats' | 'mouseholes' | 'foodPiles' | 'foodRespawnTicks', number[]>
  cells: SurvivalCell[]
}

export interface SurvivalEstimate {
  /** Seeds whose mice were still alive at the run's tick count. */
  survived: number
  /** Seeds measured. Shown alongside, so the reader sees the sample. */
  measured: number
  /** The run's own tick count, which the figure is only true for. */
  ticks: number
  /** False when the settings sat between measured points. */
  exact: boolean
  cell: Pick<SurvivalCell, 'cats' | 'mouseholes' | 'foodPiles' | 'foodRespawnTicks'>
  /** Fields the sweep held fixed that this run departs from. */
  offAxis: string[]
}

/** Interpolating across this would cross the cliff, so it is match-or-nothing. */
const EXACT_AXES = ['cats'] as const
const NEAR_AXES = ['mouseholes', 'foodPiles', 'foodRespawnTicks'] as const

const nearest = (values: number[], want: number): number | null =>
  values.reduce<number | null>((best, v) =>
    best === null || Math.abs(v - want) < Math.abs(best - want) ? v : best, null)

/**
 * What the measured grid says about this configuration, or null where it says
 * nothing: an unmeasured preset, a horizon beyond the sweep, or a cat count
 * outside the range that was actually run.
 */
export function estimateSurvival(
  config: RunConfig,
  table: SurvivalTable,
): SurvivalEstimate | null {
  if (!Number.isFinite(config.ticks) || config.ticks > table.ticks) return null

  const here = table.cells.filter((c) => c.preset === config.preset)
  if (here.length === 0) return null

  // Match-or-nothing axes first, because a near miss on one of these is not a
  // near miss at all.
  let candidates = here
  for (const axis of EXACT_AXES) {
    candidates = candidates.filter((c) => c[axis] === config[axis])
    if (candidates.length === 0) return null
  }

  const target = Object.fromEntries(
    NEAR_AXES.map((a) => [a, nearest(candidates.map((c) => c[a]), config[a])]),
  ) as Record<(typeof NEAR_AXES)[number], number | null>

  // One pass per axis rather than a distance over all three, so a cell is only
  // chosen if it is the nearest on every axis independently -- the grid is
  // complete, so such a cell always exists.
  for (const axis of NEAR_AXES) {
    const narrowed = candidates.filter((c) => c[axis] === target[axis])
    if (narrowed.length > 0) candidates = narrowed
  }
  const cell = candidates[0]
  if (cell === undefined) return null

  const exact = EXACT_AXES.every((a) => cell[a] === config[a])
    && NEAR_AXES.every((a) => cell[a] === config[a])

  const fixed = table.fixedPerPreset[config.preset]
  const offAxis: string[] = []
  if (config.nutritionDecayPerTick !== table.held.nutritionDecayPerTick) {
    offAxis.push('nutritionDecayPerTick')
  }
  if ((config.startingNutrition ?? 100) !== table.held.startingNutrition) {
    offAxis.push('startingNutrition')
  }
  for (const p of PERSONALITIES) {
    if (config.personality?.[p] !== table.held.personality[p]) {
      offAxis.push('personality')
      break
    }
  }
  if (config.traps !== fixed.traps) offAxis.push('traps')
  if (config.maleMice + config.femaleMice !== fixed.maleMice + fixed.femaleMice) {
    offAxis.push('startingMice')
  }

  // A seed counts as surviving when its mice were still alive at the horizon:
  // null means it outlived the whole sweep, and a turn later than the run's
  // own length means it had not died yet when this run would have stopped.
  const survived = cell.diedAt.filter((d) => d === null || d > config.ticks).length

  return {
    survived,
    measured: cell.diedAt.length,
    ticks: config.ticks,
    exact,
    cell: {
      cats: cell.cats, mouseholes: cell.mouseholes,
      foodPiles: cell.foodPiles, foodRespawnTicks: cell.foodRespawnTicks,
    },
    offAxis,
  }
}
