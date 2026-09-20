// What the configuration screen is allowed to claim about a run's chances.
//
// The engine is deterministic, so survival probability is not an opinion: it
// is the fraction of measured seeds whose mice outlived the horizon. These
// tests fix what the lookup may and may not infer from the measured grid --
// in particular that it refuses to guess where nothing was measured, because
// the cat axis has a cliff and a confident interpolation across it would be a
// lie told in a number.

import { describe, it, expect } from 'vitest'
import { defaultConfig } from '../../src/config.js'
import { estimateSurvival, type SurvivalTable } from '../../src/survival.js'
import { SURVIVAL_TABLE } from '../../src/survival-table.js'
import type { RunConfig } from '../../src/types.js'

const HELD = {
  nutritionDecayPerTick: 0.3,
  startingNutrition: 100,
  personality: { bold: 25, cautious: 25, vigilant: 25, social: 25 },
}

/** A deliberately tiny table, so each assertion names the numbers it rests on. */
const TABLE: SurvivalTable = {
  measuredAt: '2026-09-20',
  ticks: 4000,
  seeds: [1, 2, 3, 4],
  held: HELD,
  fixedPerPreset: {
    small: { traps: 4, maleMice: 15, femaleMice: 15 },
    medium: { traps: 8, maleMice: 30, femaleMice: 30 },
    large: { traps: 8, maleMice: 30, femaleMice: 30 },
  },
  axes: {
    cats: [1, 2],
    mouseholes: [16, 24],
    foodPiles: [80],
    foodRespawnTicks: [145],
  },
  cells: [
    { preset: 'medium', cats: 1, mouseholes: 16, foodPiles: 80, foodRespawnTicks: 145,
      diedAt: [500, 2000, 3500, null] },
    { preset: 'medium', cats: 1, mouseholes: 24, foodPiles: 80, foodRespawnTicks: 145,
      diedAt: [null, null, null, null] },
    { preset: 'medium', cats: 2, mouseholes: 16, foodPiles: 80, foodRespawnTicks: 145,
      diedAt: [100, 200, 300, 400] },
    { preset: 'medium', cats: 2, mouseholes: 24, foodPiles: 80, foodRespawnTicks: 145,
      diedAt: [1000, 1000, null, null] },
  ],
}

const config = (over: Partial<RunConfig> = {}): RunConfig => ({
  ...defaultConfig('medium'),
  ...HELD,
  traps: 8, maleMice: 30, femaleMice: 30,
  cats: 1, mouseholes: 16, foodPiles: 80, foodRespawnTicks: 145,
  ticks: 4000,
  ...over,
})

describe('Estimating whether an ecosystem lasts the run', () => {
  it('Counts the seeds that outlived the horizon, not the seeds that survived forever', () => {
    // diedAt [500, 2000, 3500, null] at a 3000-turn run: the 3500 and the null
    // are both still alive when the run stops.
    const e = estimateSurvival(config({ ticks: 3000 }), TABLE)
    expect(e).toMatchObject({ survived: 2, measured: 4, exact: true })
  })

  it('Gives a different answer for the same settings over a longer run', () => {
    // Extinction is late, so the horizon is part of the question. The same
    // cell that is 2 of 4 at 3000 turns is 1 of 4 at 4000.
    expect(estimateSurvival(config({ ticks: 4000 }), TABLE)?.survived).toBe(1)
    expect(estimateSurvival(config({ ticks: 400 }), TABLE)?.survived).toBe(4)
  })

  it('Never claims more than it measured', () => {
    // The sweep only ran to 4000 turns, so nothing can be said about 8000.
    expect(estimateSurvival(config({ ticks: 8000 }), TABLE)).toBeNull()
  })

  it('Falls back to the nearest measured cell and says that it did', () => {
    const e = estimateSurvival(config({ mouseholes: 22 }), TABLE)
    expect(e).toMatchObject({ exact: false })
    expect(e?.cell.mouseholes).toBe(24)
  })

  it('Refuses to guess above the measured cat range', () => {
    // Two cats kill every seed in this table and three were never run. The
    // cliff is real, so clamping to the nearest measured value would report a
    // number the sweep never saw.
    expect(estimateSurvival(config({ cats: 3 }), TABLE)).toBeNull()
  })

  it('Reports an exact match as exact', () => {
    expect(estimateSurvival(config({ cats: 2, mouseholes: 24 }), TABLE))
      .toMatchObject({ survived: 2, measured: 4, exact: true })
  })

  it('Names the settings the sweep held fixed when the run departs from them', () => {
    const e = estimateSurvival(config({ nutritionDecayPerTick: 0.5, traps: 30 }), TABLE)
    expect(e?.offAxis).toEqual(expect.arrayContaining(['nutritionDecayPerTick', 'traps']))
  })

  it('Says nothing about a preset the sweep never covered', () => {
    expect(estimateSurvival({ ...config(), preset: 'large' }, TABLE)).toBeNull()
  })
})

describe('What the shipped defaults promise', () => {
  it('Puts every preset default on a cell the sweep actually measured', () => {
    // If a default sat between measured points the screen would open on a
    // nearest-neighbour guess, which is the one place the figure should be
    // exact.
    for (const preset of ['small', 'medium', 'large'] as const) {
      const e = estimateSurvival(defaultConfig(preset), SURVIVAL_TABLE)
      expect(e, preset).not.toBeNull()
      expect(e?.exact, preset).toBe(true)
      expect(e?.offAxis, preset).toEqual([])
    }
  })

  it('Gives the defaults a real chance of failing and a real chance of lasting', () => {
    // The point of the defaults is a colony that usually survives but visibly
    // might not. Guaranteed survival is not interesting and a coin flip reads
    // as broken, so the band is deliberately narrow.
    for (const preset of ['small', 'medium', 'large'] as const) {
      const e = estimateSurvival(defaultConfig(preset), SURVIVAL_TABLE)
      const share = (e?.survived ?? 0) / (e?.measured ?? 1)
      expect(share, `${preset} survives too rarely`).toBeGreaterThanOrEqual(0.6)
      expect(share, `${preset} never dies`).toBeLessThanOrEqual(0.95)
    }
  })

  it('Holds up when the run is left to go long', () => {
    // A default tuned only at its own tick count would quietly become a death
    // sentence at four thousand turns. These were picked for being flat.
    for (const preset of ['small', 'medium', 'large'] as const) {
      const config = { ...defaultConfig(preset), ticks: SURVIVAL_TABLE.ticks }
      const e = estimateSurvival(config, SURVIVAL_TABLE)
      const share = (e?.survived ?? 0) / (e?.measured ?? 1)
      expect(share, `${preset} collapses over a long run`).toBeGreaterThanOrEqual(0.55)
    }
  })
})
