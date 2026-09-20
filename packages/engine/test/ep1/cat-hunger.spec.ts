// A cat that is not catching anything goes hungry, hunts harder, and finally
// leaves to look somewhere else. Added 2026-09-20 at Carson's direction; see
// decision 64.
import { describe, it, expect } from 'vitest'
import { CAT } from '../../src/index.js'
import { engine, medium, runTicks, of } from '../helpers.js'

/** How long a cat lasts on a full stomach with nothing to catch. */
const TO_STARVE = Math.ceil(CAT.startingNutrition / CAT.decayPerTick) + 2

/** A world with no mice to catch, so a cat can only get hungrier. */
const barren = (over = {}) => medium({
  maleMice: 0, femaleMice: 0, cats: 2, traps: 0, foodPiles: 0, mouseholes: 4,
  ticks: 20_000, ...over,
})

describe('A cat that is not eating', () => {
  it('Starts fed', () => {
    const e = engine(barren())
    for (const c of e.world().cats) expect(c.nutrition).toBe(CAT.startingNutrition)
  })

  it('Gets hungrier the longer it goes without a mouse', async () => {
    const e = engine(barren())
    await runTicks(e, 100)
    const after = e.world().cats[0]?.nutrition ?? 0
    expect(after).toBeLessThan(CAT.startingNutrition)
    expect(after).toBeCloseTo(CAT.startingNutrition - 100 * CAT.decayPerTick, 5)
  })

  it('Starves to death once it runs out, and the record says so', async () => {
    const e = engine(barren())
    const events = await runTicks(e, TO_STARVE)
    const died = of(events, 'cat_died')
    expect(died.length).toBe(2)
    expect(died[0]?.cause).toBe('starvation')
    expect(died[0]?.nutrition).toBeLessThanOrEqual(0)
  })

  it('Is gone from the world once it is dead, and stops hunting', async () => {
    const e = engine(barren())
    await runTicks(e, TO_STARVE)
    expect(e.world().cats).toHaveLength(0)
    const after = await runTicks(e, 50)
    expect(of(after, 'cat_pounced')).toHaveLength(0)
    expect(of(after, 'capture')).toHaveLength(0)
    expect(of(after, 'cat_died')).toHaveLength(0)
  })
})

describe('A cat that catches a mouse', () => {
  it('Is fed by the meal', async () => {
    // Many mice and no shelter, so a cat will certainly catch one.
    const e = engine(medium({
      maleMice: 60, femaleMice: 60, cats: 2, traps: 0, mouseholes: 0,
      foodPiles: 60, foodRespawnTicks: 10, ticks: 20_000,
    }))
    const events = await runTicks(e, 600)
    const meals = of(events, 'cat_fed')
    expect(meals.length).toBeGreaterThan(0)
    expect(meals[0]?.restored).toBeGreaterThan(0)
  })

  it('Is never fed above full', async () => {
    const e = engine(medium({
      maleMice: 60, femaleMice: 60, cats: 3, traps: 0, mouseholes: 0,
      foodPiles: 60, foodRespawnTicks: 10, ticks: 20_000,
    }))
    await runTicks(e, 1200)
    for (const c of e.world().cats) {
      expect(c.nutrition).toBeLessThanOrEqual(CAT.startingNutrition)
      expect(c.nutrition).toBeGreaterThan(0)
    }
  })

  it('Does not starve where it is succeeding', async () => {
    const e = engine(medium({
      maleMice: 60, femaleMice: 60, cats: 2, traps: 0, mouseholes: 0,
      foodPiles: 60, foodRespawnTicks: 10, ticks: 20_000,
    }))
    const events = await runTicks(e, 1500)
    expect(of(events, 'capture').length).toBeGreaterThan(0)
    expect(of(events, 'cat_died')).toHaveLength(0)
  })
})

describe('A hungry cat hunts harder', () => {
  it('Sees further than a fed one', () => {
    expect(CAT.perceptionHungry).toBeGreaterThan(CAT.perception)
  })

  it('Springs from further away and recovers sooner', () => {
    expect(CAT.pounceRangeHungry).toBeGreaterThan(CAT.pounceRange)
    expect(CAT.pounceCooldownHungry).toBeLessThan(CAT.pounceCooldown)
  })

  it('Reports itself as hungry once it drops below the threshold', async () => {
    const e = engine(barren())
    const toHungry = Math.ceil((CAT.startingNutrition - CAT.hungryBelow + 1) / CAT.decayPerTick)
    expect(e.world().cats[0]?.hungry).toBe(false)
    await runTicks(e, toHungry)
    expect(e.world().cats[0]?.hungry).toBe(true)
  })

  it('Does not stop to rest after losing a mouse', async () => {
    const fed = engine(barren({ cats: 1 }))
    expect(fed.world().cats[0]?.hungry).toBe(false)
    const hungryTicks = Math.ceil((CAT.startingNutrition - CAT.hungryBelow + 1) / CAT.decayPerTick)
    const e = engine(medium({
      maleMice: 40, femaleMice: 0, cats: 1, traps: 0, mouseholes: 40,
      foodPiles: 40, ticks: 20_000,
    }))
    await runTicks(e, hungryTicks)
    const hungry = e.world().cats[0]
    if (hungry?.hungry === true) {
      const after = await runTicks(e, 60)
      const rests = of(after, 'cat_targeted').filter((x) => x.mode === 'rest')
      expect(rests).toHaveLength(0)
    }
  })
})

describe('A cat starving', () => {
  it('Ends the run, because nothing is left alive', async () => {
    const e = engine(barren({ ticks: 2000 }))
    await runTicks(e, 2000)
    expect(e.world().cats).toHaveLength(0)
    const ended = of(e.events(), 'run_ended')
    expect(ended).toHaveLength(1)
    expect(ended[0]?.reason).toBe('extinct')
  })

  it('Survives a snapshot taken before it goes', async () => {
    const { restore } = await import('../../src/index.js')
    const { baselineProvider } = await import('../../src/index.js')
    const e = engine(barren())
    await runTicks(e, 200)
    const before = e.world().cats.map((c) => c.nutrition)
    const resumed = restore(e.serialize(), { provider: baselineProvider() })
    expect(resumed.world().cats.map((c) => c.nutrition)).toEqual(before)
  })
})

describe('Total extinction', () => {
  it('Ends the run the moment the last living thing is gone', async () => {
    const e = engine(medium({
      maleMice: 4, femaleMice: 0, cats: 0, traps: 0, foodPiles: 0, mouseholes: 0,
      nutritionDecayPerTick: 2, ticks: 5000,
    }))
    const events = await runTicks(e, 200)
    const ended = of(events, 'run_ended')
    expect(ended).toHaveLength(1)
    expect(ended[0]?.reason).toBe('extinct')
    // It stopped early rather than running out its configured turns.
    expect(ended[0]?.finalTick).toBeLessThan(200)
    expect(e.world().mice).toHaveLength(0)
    expect(e.world().cats).toHaveLength(0)
  })

  it('Does not end while a cat is still alive with no mice left', async () => {
    const e = engine(medium({
      maleMice: 2, femaleMice: 0, cats: 2, traps: 0, foodPiles: 0, mouseholes: 0,
      nutritionDecayPerTick: 2, ticks: 5000,
    }))
    const events = await runTicks(e, 120)
    expect(e.world().mice).toHaveLength(0)
    expect(e.world().cats.length).toBeGreaterThan(0)
    expect(of(events, 'run_ended')).toHaveLength(0)
  })

  it('Does not end while a mouse is still alive with no cats left', async () => {
    const e = engine(medium({
      maleMice: 6, femaleMice: 0, cats: 0, traps: 0, foodPiles: 40,
      foodRespawnTicks: 5, mouseholes: 0, nutritionDecayPerTick: 0.2, ticks: 400,
    }))
    const events = await runTicks(e, 200)
    expect(e.world().mice.length).toBeGreaterThan(0)
    expect(of(events, 'run_ended')).toHaveLength(0)
  })

  it('Stops advancing once everything is dead', async () => {
    const e = engine(medium({
      maleMice: 2, femaleMice: 0, cats: 0, traps: 0, foodPiles: 0, mouseholes: 0,
      nutritionDecayPerTick: 4, ticks: 5000,
    }))
    await runTicks(e, 100)
    const settled = e.world().tick
    await runTicks(e, 50)
    expect(e.world().tick).toBe(settled)
  })

  it('Ends as completed, not extinct, when the turns simply run out', async () => {
    const e = engine(medium({
      foodPiles: 50, foodRespawnTicks: 15, nutritionDecayPerTick: 0.3,
      mouseholes: 24, cats: 3, ticks: 150,
    }))
    const events = await runTicks(e, 150)
    const ended = of(events, 'run_ended')
    expect(ended).toHaveLength(1)
    expect(ended[0]?.reason).toBe('completed')
  })
})
