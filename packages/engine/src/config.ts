// Run configuration: presets, the caps they imply, defaults and validation.
// The same validator runs in the configuration screen and in the engine, so a
// screen and a simulation can never disagree about what is legal.

import type { Caps, Personality, Preset, RunConfig, ValidationError } from './types.js'
import { PERSONALITIES } from './types.js'

export const PRESETS: Record<Preset, { width: number; height: number }> = {
  small: { width: 48, height: 32 },
  medium: { width: 80, height: 50 },
  large: { width: 120, height: 75 },
}

/** Caps derive from grid area, so a bigger world holds proportionally more. */
export function capsFor(preset: Preset): Caps {
  const { width, height } = PRESETS[preset]
  const cells = width * height
  return {
    mice: Math.floor(cells / 25),
    food: Math.floor(cells / 50),
    mouseholes: Math.floor(cells / 50),
    traps: Math.floor(cells / 100),
    cats: Math.floor(cells / 400),
  }
}

export const TICK_RANGE = { min: 100, max: 20000 } as const

export function defaultConfig(preset: Preset): RunConfig {
  // Clamped to the preset's own caps, so a default is always a configuration
  // that preset accepts. The small map is too small for four cats.
  const caps = capsFor(preset)
  const mice = Math.min(60, caps.mice)
  return {
    preset,
    ticks: 2000,
    maleMice: Math.floor(mice / 2),
    femaleMice: mice - Math.floor(mice / 2),
    cats: Math.min(4, caps.cats),
    traps: Math.min(8, caps.traps),
    foodPiles: Math.min(20, caps.food),
    mouseholes: Math.min(12, caps.mouseholes),
    foodRespawnTicks: 40,
    nutritionDecayPerTick: 0.5,
    startingNutrition: 100,
    personality: { bold: 25, cautious: 25, vigilant: 25, social: 25 },
  }
}

/**
 * Not a finite number.
 *
 * Every bound below was a bare comparison, and every comparison against NaN is
 * false, so NaN satisfied all of them at once. A NaN decay made a mouse's
 * nutrition NaN, which is never at or below zero, so nothing ever starved; a
 * NaN percentage made the personality sum NaN, which is never more than a
 * hair from 100, so the mix validated and every mouse drawn came out social.
 */
const notANumber = (v: unknown): boolean =>
  typeof v !== 'number' || !Number.isFinite(v)

export function validateConfig(c: RunConfig): ValidationError[] {
  const errors: ValidationError[] = []

  // First, because the caps cannot be read without it. An unknown preset threw
  // out of capsFor, which the server turned into a bare 500.
  if (!(c.preset in PRESETS)) {
    return [{
      field: 'preset', code: 'out_of_range',
      message: `World must be one of ${Object.keys(PRESETS).join(', ')}; `
        + `this asks for ${JSON.stringify(c.preset) ?? 'nothing'}.`,
    }]
  }
  const caps = capsFor(c.preset)

  if (notANumber(c.ticks) || !Number.isInteger(c.ticks)
      || c.ticks < TICK_RANGE.min || c.ticks > TICK_RANGE.max) {
    errors.push({
      field: 'ticks', code: 'out_of_range',
      message: `Tick count must be a whole number between ${TICK_RANGE.min} and ${TICK_RANGE.max}.`,
    })
  }

  const mice = c.maleMice + c.femaleMice
  if (Number.isFinite(mice) && mice > caps.mice) {
    errors.push({
      field: 'mice', code: 'above_cap', cap: caps.mice,
      message: `${label(c.preset)} allows ${caps.mice} mice in total; this asks for ${mice}.`,
    })
  }
  for (const [field, value, cap] of [
    ['foodPiles', c.foodPiles, caps.food],
    ['mouseholes', c.mouseholes, caps.mouseholes],
    ['traps', c.traps, caps.traps],
    ['cats', c.cats, caps.cats],
  ] as const) {
    if (Number.isFinite(value) && value > cap) {
      errors.push({
        field, code: 'above_cap', cap,
        message: `${label(c.preset)} allows ${cap} ${field}; this asks for ${value}.`,
      })
    }
  }

  for (const [field, value] of [
    ['maleMice', c.maleMice], ['femaleMice', c.femaleMice], ['cats', c.cats],
    ['traps', c.traps], ['foodPiles', c.foodPiles], ['mouseholes', c.mouseholes],
    ['foodRespawnTicks', c.foodRespawnTicks],
  ] as const) {
    if (notANumber(value) || !Number.isInteger(value) || value < 0) {
      errors.push({
        field, code: 'out_of_range',
        message: `${field} must be a whole number of zero or more.`,
      })
    }
  }
  if (notANumber(c.nutritionDecayPerTick)
      || c.nutritionDecayPerTick <= 0 || c.nutritionDecayPerTick > 10) {
    errors.push({
      field: 'nutritionDecayPerTick', code: 'out_of_range',
      message: 'Nutrition decay must be a number greater than zero and at most 10 per tick.',
    })
  }
  const start = c.startingNutrition ?? 100
  if (notANumber(start) || start <= 0 || start > 100) {
    errors.push({
      field: 'startingNutrition', code: 'out_of_range',
      message: 'Starting nutrition must be a number greater than zero and at most 100.',
    })
  }

  // Each one first: a sum of NaN would otherwise swallow the reason.
  for (const p of PERSONALITIES) {
    const v = c.personality?.[p]
    if (notANumber(v) || (v as number) < 0 || (v as number) > 100) {
      errors.push({
        field: `personality.${p}`, code: 'out_of_range',
        message: `${p} must be a number between 0 and 100.`,
      })
    }
  }
  const sum = PERSONALITIES.reduce((t, p) => t + (c.personality?.[p] ?? 0), 0)
  if (notANumber(sum) || Math.abs(sum - 100) > 1e-9) {
    errors.push({
      field: 'personality', code: 'sum_not_100',
      message: `The four personality percentages must total 100; these total ${sum}.`,
    })
  }
  return errors
}

const label = (p: Preset): string => p.charAt(0).toUpperCase() + p.slice(1)

/** Draw a personality from the configured percentages. */
export function drawPersonality(c: RunConfig, roll: number): Personality {
  let acc = 0
  for (const p of PERSONALITIES) {
    acc += c.personality[p] ?? 0
    if (roll * 100 < acc) return p
  }
  return 'social'
}
