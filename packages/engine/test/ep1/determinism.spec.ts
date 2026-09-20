// US-E01-01 Deterministic seeded run
// Satisfies FR-007, NFR-004, NFR-010. Verifies SM-03.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { engine, runTicks, comparable, medium, SEED } from '../helpers.js'
import { createRng } from '../../src/index.js'

describe('US-E01-01 Deterministic seeded run', () => {
  it('Identical inputs produce an identical event stream', async () => {
    const a = await runTicks(engine(medium(), SEED), 500)
    const b = await runTicks(engine(medium(), SEED), 500)
    expect(comparable(b)).toEqual(comparable(a))
    expect(b.map((e) => e.seq)).toEqual(a.map((e) => e.seq))
  })

  it('A different seed produces a different stream', async () => {
    const a = await runTicks(engine(medium(), SEED), 500)
    const b = await runTicks(engine(medium(), SEED + 1), 500)
    expect(comparable(b)).not.toEqual(comparable(a))
  })

  it('The generator is reproducible and restorable mid-stream', () => {
    const r = createRng(SEED)
    const first = [r.next(), r.next(), r.next()]
    const mark = r.state()
    const next = [r.next(), r.next()]
    r.restore(mark)
    expect([r.next(), r.next()]).toEqual(next)
    expect(createRng(SEED).next()).toBe(first[0])
  })

  it('The engine cannot reach outside itself', () => {
    const src = readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')
    for (const forbidden of ['Math.random', 'Date.now', 'new Date(', 'fetch(', 'document.']) {
      expect(src, `engine source must not contain ${forbidden}`).not.toContain(forbidden)
    }
  })
})
