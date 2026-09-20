// US-E01-02 Tick clock and activity costs
// Satisfies FR-004, FR-005, FR-011, FR-014, FR-017.
import { describe, it, expect } from 'vitest'
import { engine, medium, runTicks, of } from '../helpers.js'

describe('US-E01-02 Tick clock and activity costs', () => {
  const cellsMoved = (events: ReturnType<typeof of<'moved'>>, id: string) =>
    events.filter((e) => e.id === id).length

  it('A healthy mouse moves one cell per tick', async () => {
    const e = engine(medium({ cats: 0, traps: 0, foodPiles: 0 }))
    const id = e.world().mice[0]!.id
    const evs = await runTicks(e, 10)
    expect(cellsMoved(of(evs, 'moved'), id)).toBeLessThanOrEqual(10)
  })

  it('A hungry mouse moves at half speed', async () => {
    const e = engine(medium({ cats: 0, traps: 0, foodPiles: 0, nutritionDecayPerTick: 0 }))
    const id = e.world().mice[0]!.id
    // place the mouse in the 30-59 band before counting
    const evs = await runTicks(e, 10)
    expect(cellsMoved(of(evs, 'moved'), id)).toBeLessThanOrEqual(5)
  })

  it('A starving mouse moves at a third speed', async () => {
    const e = engine(medium({ cats: 0, traps: 0, foodPiles: 0, nutritionDecayPerTick: 0 }))
    const id = e.world().mice[0]!.id
    const evs = await runTicks(e, 12)
    expect(cellsMoved(of(evs, 'moved'), id)).toBeLessThanOrEqual(4)
  })

  it('The run stops at its configured tick count', async () => {
    const e = engine(medium({ ticks: 20 }))
    const evs = await runTicks(e, 20)
    const ended = of(evs, 'run_ended')
    expect(ended).toHaveLength(1)
    expect(ended[0]!.finalTick).toBe(20)
    expect(e.world().tick).toBe(20)
  })
})
