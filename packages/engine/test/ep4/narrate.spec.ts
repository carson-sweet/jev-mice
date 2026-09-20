// One narrator for both the live log and the turn history. ISSUE-019: they each
// had a copy and had already drifted on two kinds.
import { describe, it, expect } from 'vitest'
import { narrate, CHANGES_POPULATION, NOT_WORTH_SAYING } from '../../src/index.js'
import { engine, medium, runTicks } from '../helpers.js'

describe('Putting an event into words', () => {
  it('Says a starvation one way, not two', () => {
    const said = narrate({ kind: 'death', tick: 5, seq: 1, id: 'm0001',
                           cause: 'starvation' } as never)
    expect(said.text).toBe('m0001 starved.')
    expect(said.subject).toBe('m0001')
  })

  it('Names the cat, the trap and the mother', () => {
    expect(narrate({ kind: 'capture', tick: 1, seq: 1, catId: 'c0001',
                     mouseId: 'm0002' } as never).text)
      .toBe('m0002 was caught by c0001.')
    expect(narrate({ kind: 'mouse_trapped', tick: 1, seq: 1, id: 'm0003',
                     trapId: 't0004' } as never).text)
      .toBe('m0003 died in t0004.')
    expect(narrate({ kind: 'cap_limited_birth', tick: 1, seq: 1, motherId: 'm0005',
                     lost: 3 } as never).text)
      .toBe("3 of m0005's litter had nowhere to go; the world is full.")
  })

  it('Calls total extinction what it is', () => {
    expect(narrate({ kind: 'run_ended', tick: 90, seq: 1, reason: 'extinct',
                     finalTick: 90 } as never).text).toMatch(/Total extinction/)
    expect(narrate({ kind: 'run_ended', tick: 90, seq: 1, reason: 'completed',
                     finalTick: 90 } as never).text).not.toMatch(/extinction/)
  })

  it('Has something to say about every event anyone is shown', async () => {
    const e = engine(medium({
      cats: 4, traps: 12, mouseholes: 20, foodPiles: 40, foodRespawnTicks: 10,
      nutritionDecayPerTick: 0.4, ticks: 2_000,
    }))
    const events = await runTicks(e, 600)
    const kinds = new Set(events.map((x) => x.kind))
    expect(kinds.size).toBeGreaterThan(12)
    for (const event of events) {
      // The ones nobody is shown need no line; that is what the list is for.
      if (NOT_WORTH_SAYING.has(event.kind)) continue
      const said = narrate(event)
      // A bare kind name means the narrator has no line for it.
      expect(said.text, `nothing to say about ${event.kind}`).not.toBe(event.kind)
      expect(said.text.length).toBeGreaterThan(event.kind.length)
    }
  }, 30_000)

  it('Keeps the two lists from overlapping', () => {
    for (const kind of CHANGES_POPULATION) {
      expect(NOT_WORTH_SAYING.has(kind), `${kind} is in both lists`).toBe(false)
    }
  })
})
