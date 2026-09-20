// What a run costs to store. The per-turn telemetry view reads stored chunks
// back, so an event that repeats static text is not a detail. Added 2026-09-20.
import { describe, it, expect } from 'vitest'
import {
  driveQuestion, fearQuestion, DRIVE_CRITERIA, type Drive,
} from '../../src/index.js'
import { engine, medium, runTicks, of } from '../helpers.js'

const bytes = (v: unknown): number => Buffer.byteLength(JSON.stringify(v), 'utf8')

describe('What a decision costs to record', () => {
  it('Does not repeat the question wording in every batch', async () => {
    const events = await runTicks(engine(medium({ ticks: 400 })), 60)
    const returned = of(events, 'decision_returned')
    expect(returned.length).toBeGreaterThan(0)
    const text = JSON.stringify(returned)
    // The criteria are a constant of the engine, not a fact about a batch.
    expect(text).not.toContain(DRIVE_CRITERIA.eat.what)
    expect(text).not.toContain('not_for')
  })

  it('Keeps a recorded decision small enough to store a long run', async () => {
    const events = await runTicks(engine(medium({ ticks: 400 })), 60)
    for (const e of of(events, 'decision_returned')) {
      // Eight subjects of state, answers and weights. Kilobytes, not tens of them.
      expect(bytes(e)).toBeLessThan(8_000)
    }
  })

  it('Still says exactly what each mouse was asked', async () => {
    const events = await runTicks(engine(medium({ ticks: 400 })), 60)
    const subject = of(events, 'decision_returned')
      .flatMap((e) => e.subjects)
      .find((s) => s.agentId.startsWith('m'))
    expect(subject).toBeDefined()
    expect(subject?.options.length).toBeGreaterThan(0)
    // The wording is recoverable from the option set and the engine version,
    // which is where a constant belongs.
    const asked = driveQuestion(subject!.agentId, subject!.options as Drive[])
    expect(Object.keys((asked as { criteria: object }).criteria).sort())
      .toEqual([...subject!.options].sort())
    expect(bytes(fearQuestion(subject!.agentId))).toBeGreaterThan(0)
  })

  it('Keeps a whole chunk of turns inside a few megabytes', async () => {
    const events = await runTicks(engine(medium({
      ticks: 300, foodPiles: 50, foodRespawnTicks: 15,
      nutritionDecayPerTick: 0.3, mouseholes: 24, cats: 3,
    })), 250)
    // 250 turns is one stored chunk. It has to be a size a page can fetch.
    expect(bytes(events)).toBeLessThan(4 * 1024 * 1024)
  }, 30_000)
})
