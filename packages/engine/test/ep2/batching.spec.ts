// US-E02-02 Requests are batched by proximity
// Satisfies FR-074. Verifies SM-01.
import { describe, it, expect } from 'vitest'
import { composeRequests } from '../../src/index.js'

let n = 0
const ids = () => `b${++n}`
import { engine, medium } from '../helpers.js'

describe('US-E02-02 Requests are batched by proximity', () => {
  const world = () => engine(medium()).world()

  it('Up to eight mice share a request', () => {
    const w = world()
    const ready = w.mice.slice(0, 12).map((m) => m.id)
    const reqs = composeRequests(w, ready, ids)
    expect(reqs).toHaveLength(2)
    expect(reqs.map((r) => r.agents.length).sort((a, b) => b - a)).toEqual([8, 4])
  })

  it('Each mouse is addressed by its own key', () => {
    const w = world()
    const ready = w.mice.slice(0, 3).map((m) => m.id)
    const [req] = composeRequests(w, ready, ids)
    for (const id of ready) {
      expect(Object.keys(req!.state)).toContain(id)
      const asked = JSON.stringify(req!.questions)
      expect(asked, `no question names ${id}`).toContain(id)
    }
  })

  it('Cats are never mixed with mice', () => {
    const w = world()
    const ready = [...w.mice.slice(0, 4).map((m) => m.id), ...w.cats.slice(0, 2).map((c) => c.id)]
    const catIds = new Set(w.cats.map((c) => c.id))
    for (const req of composeRequests(w, ready, ids)) {
      const hasCat = req.agents.some((a) => catIds.has(a))
      const hasMouse = req.agents.some((a) => !catIds.has(a))
      expect(hasCat && hasMouse, 'a request mixed a cat with a mouse').toBe(false)
    }
  })

  it('Grouping is deterministic', () => {
    const w = world()
    const ready = w.mice.slice(0, 11).map((m) => m.id)
    const a = composeRequests(w, ready, ids).map((r) => r.agents)
    const b = composeRequests(w, ready, ids).map((r) => r.agents)
    expect(b).toEqual(a)
  })

  it('Grouping keeps mice near one another', () => {
    const w = world()
    const ready = w.mice.map((m) => m.id)
    const at = new Map(w.mice.map((m) => [m.id, m.at]))
    for (const req of composeRequests(w, ready, ids)) {
      if (req.agents.length < 2) continue
      const pts = req.agents.map((a) => at.get(a)!)
      const spanX = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))
      const spanY = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
      // A batch may straddle a block boundary, which is what keeps batches full;
      // what it must not do is gather mice from opposite ends of the world.
      expect(Math.max(spanX, spanY),
        'a batch spanned more of the map than proximity grouping should allow')
        .toBeLessThan(Math.max(w.width, w.height) * 0.75)
    }
  })
})
