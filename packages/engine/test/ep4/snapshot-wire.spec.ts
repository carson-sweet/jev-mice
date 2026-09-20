// A snapshot is a JSON document: serialize clones through JSON and the stored
// copy is gzipped JSON. Anything JSON cannot carry is therefore lost between a
// run and its resumption, which makes the resumed run a different run.
import { describe, it, expect } from 'vitest'
import { restore, baselineProvider } from '../../src/index.js'
import { engine, medium, runTicks, comparable } from '../helpers.js'

const overWire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

describe('A snapshot on its way to storage', () => {
  it('Carries a number for every number, with nothing turned into null', () => {
    // Taken before the first turn on purpose: that is when placeholders are
    // still at their initial values, whatever the seed goes on to do. Probing
    // only mid-run passes or fails by luck.
    const snapshot = engine(medium({ ticks: 20_000 })).serialize()
    const nulls: string[] = []
    const walk = (v: unknown, path: string): void => {
      if (v === null) { nulls.push(path); return }
      if (typeof v !== 'object') return
      for (const key of Object.keys(v as Record<string, unknown>)) {
        walk((v as Record<string, unknown>)[key], `${path}.${key}`)
      }
    }
    walk(snapshot, 'snapshot')
    // A null is legitimate where the type says so, and nowhere else. Every one
    // of these is declared as nullable; a number that became null is not.
    const allowed = /\.(target|lastSighting|inHole|intent|pregnantSince|busyWith|eatingFoodId|mateTarget|occupantId|adult|fallbackReason|bestDistance)$/
    expect(nulls.filter((p) => !allowed.test(p))).toEqual([])
  })

  it('Resumes identically from before the first turn', async () => {
    const config = medium({ ticks: 20_000 })
    const straight = engine(config)
    // Building a world emits its own events; a resumed run does not repeat
    // them, so the comparison starts after them.
    const setup = straight.events().length
    await runTicks(straight, 80)

    const resumed = restore(overWire(engine(config).serialize()),
                            { provider: baselineProvider() })
    const after = await runTicks(resumed, 80)
    expect(comparable(after)).toEqual(comparable(straight.events().slice(setup)))
  }, 30_000)

  it('Resumes identically from many cut points', async () => {
    const config = medium({
      ticks: 20_000, foodPiles: 50, foodRespawnTicks: 15,
      nutritionDecayPerTick: 0.3, mouseholes: 24, cats: 3,
    })
    const straight = engine(config)
    await runTicks(straight, 120)
    const whole = straight.events()

    for (const cut of [3, 11, 29, 61, 97]) {
      const first = engine(config)
      await runTicks(first, cut)
      const before = first.events().length
      const resumed = restore(overWire(first.serialize()), { provider: baselineProvider() })
      const after = await runTicks(resumed, 120 - cut)
      expect(comparable(after), `cut at ${String(cut)}`)
        .toEqual(comparable(whole.slice(before)))
    }
  }, 60_000)
})
