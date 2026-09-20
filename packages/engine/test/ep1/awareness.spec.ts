// The events that make a turn legible: a band of hunger changing, and an animal
// newly perceiving something. Added 2026-09-20 at Carson's direction so a
// per-turn telemetry view has more than movement and death in it.
import { describe, it, expect } from 'vitest'
import { NUTRITION_BANDS, CAT } from '../../src/index.js'
import { engine, medium, runTicks, of } from '../helpers.js'

describe('Hunger crossing a band', () => {
  it('Is recorded for a mouse, naming the band it left and the one it entered', async () => {
    const e = engine(medium({
      maleMice: 8, femaleMice: 0, cats: 0, traps: 0, foodPiles: 0, mouseholes: 0,
      nutritionDecayPerTick: 1, ticks: 400,
    }))
    const events = await runTicks(e, 200)
    const changes = of(events, 'hunger_changed').filter((x) => x.subject === 'mouse')
    expect(changes.length).toBeGreaterThan(0)
    const first = changes[0]
    expect(first?.from).toBe('fed')
    expect(first?.to).toBe('hungry')
    expect(changes.some((c) => c.from === 'hungry' && c.to === 'starving')).toBe(true)
  })

  it('Is recorded once per crossing, not once per tick', async () => {
    const e = engine(medium({
      maleMice: 1, femaleMice: 0, cats: 0, traps: 0, foodPiles: 0, mouseholes: 0,
      nutritionDecayPerTick: 1, ticks: 400,
    }))
    const events = await runTicks(e, 120)
    const mine = of(events, 'hunger_changed').filter((x) => x.id === 'm0001')
    // Fed to hungry, then hungry to starving. Nothing else for one mouse.
    expect(mine).toHaveLength(2)
  })

  it('Is recorded when a mouse eats its way back up a band', async () => {
    const e = engine(medium({
      maleMice: 20, femaleMice: 0, cats: 0, traps: 0, foodPiles: 60,
      foodRespawnTicks: 5, mouseholes: 0, nutritionDecayPerTick: 0.8, ticks: 800,
    }))
    const events = await runTicks(e, 600)
    const recovered = of(events, 'hunger_changed')
      .filter((x) => x.from === 'hungry' && x.to === 'fed')
    expect(recovered.length).toBeGreaterThan(0)
  })

  it('Is recorded for a cat when it drops below half', async () => {
    const e = engine(medium({
      maleMice: 0, femaleMice: 0, cats: 2, traps: 0, foodPiles: 0, ticks: 2000,
    }))
    const ticks = Math.ceil((CAT.startingNutrition - CAT.hungryBelow + 1) / CAT.decayPerTick)
    const events = await runTicks(e, ticks)
    const cats = of(events, 'hunger_changed').filter((x) => x.subject === 'cat')
    expect(cats.length).toBe(2)
    expect(cats[0]?.from).toBe('fed')
    expect(cats[0]?.to).toBe('hungry')
  })

  it('Uses the same bands the movement speed uses', () => {
    expect(NUTRITION_BANDS.fed).toBe(60)
    expect(NUTRITION_BANDS.hungry).toBe(30)
  })
})

describe('Newly perceiving something', () => {
  it('Records a mouse spotting a food pile', async () => {
    const e = engine(medium({
      maleMice: 10, femaleMice: 0, cats: 0, traps: 0, foodPiles: 40, mouseholes: 0,
      ticks: 400,
    }))
    const events = await runTicks(e, 100)
    const spots = of(events, 'spotted').filter((s) => s.what === 'food')
    expect(spots.length).toBeGreaterThan(0)
    expect(spots[0]?.id).toMatch(/^m/)
    expect(spots[0]?.targetId).toMatch(/^f/)
  })

  it('Records a mouse spotting a trap', async () => {
    const e = engine(medium({
      maleMice: 20, femaleMice: 0, cats: 0, traps: 40, foodPiles: 0, mouseholes: 0,
      ticks: 400,
    }))
    const events = await runTicks(e, 150)
    const spots = of(events, 'spotted').filter((s) => s.what === 'trap')
    expect(spots.length).toBeGreaterThan(0)
    expect(spots[0]?.targetId).toMatch(/^t/)
  })

  it('Records a mouse spotting a cat, and a cat spotting a mouse', async () => {
    const e = engine(medium({
      maleMice: 30, femaleMice: 0, cats: 4, traps: 0, foodPiles: 20, mouseholes: 0,
      ticks: 400,
    }))
    const events = await runTicks(e, 200)
    const byMouse = of(events, 'spotted').filter((s) => s.what === 'cat')
    const byCat = of(events, 'spotted').filter((s) => s.what === 'mouse')
    expect(byMouse.length).toBeGreaterThan(0)
    expect(byCat.length).toBeGreaterThan(0)
    expect(byCat[0]?.id).toMatch(/^c/)
  })

  it('Records the entry only, not every tick it stays in view', async () => {
    // One mouse and one food pile it cannot reach, so the pile stays in view.
    const e = engine(medium({
      maleMice: 1, femaleMice: 0, cats: 0, traps: 0, foodPiles: 1, mouseholes: 0,
      nutritionDecayPerTick: 0.01, ticks: 400,
    }))
    const events = await runTicks(e, 300)
    const spots = of(events, 'spotted').filter((s) => s.what === 'food')
    const perTarget = new Map<string, number>()
    for (const s of spots) perTarget.set(s.targetId, (perTarget.get(s.targetId) ?? 0) + 1)
    for (const [, n] of perTarget) {
      // Wandering in and out of range may spot the same pile again, but a pile
      // held in view must not be reported every tick.
      expect(n).toBeLessThan(40)
    }
  })

  it('Does not report anything a mouse cannot perceive', async () => {
    const e = engine(medium({
      maleMice: 4, femaleMice: 0, cats: 0, traps: 0, foodPiles: 40, mouseholes: 0,
      ticks: 200,
    }))
    const events = await runTicks(e, 60)
    const view = e.world()
    for (const s of of(events, 'spotted')) {
      expect(['food', 'trap', 'cat', 'mouse']).toContain(s.what)
      expect(s.distance).toBeGreaterThanOrEqual(0)
      expect(s.distance).toBeLessThanOrEqual(11)
    }
    expect(view.mice.length).toBeGreaterThan(0)
  })

  it('Survives a snapshot, so a resumed run does not re-spot everything', async () => {
    const { restore, baselineProvider } = await import('../../src/index.js')
    const config = medium({
      maleMice: 12, femaleMice: 0, cats: 2, traps: 8, foodPiles: 30, ticks: 600,
    })
    const straight = engine(config)
    await runTicks(straight, 200)
    const snapshot = straight.serialize()
    const after = await runTicks(straight, 60)

    const resumed = restore(snapshot, { provider: baselineProvider() })
    const resumedAfter = await runTicks(resumed, 60)
    expect(of(resumedAfter, 'spotted').length).toBe(of(after, 'spotted').length)
  })
})
