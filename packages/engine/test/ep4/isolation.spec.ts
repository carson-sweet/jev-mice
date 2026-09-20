// US-E04-01 A run outlives the tab  /  US-E04-04 No storage credential
// Satisfies FR-091, FR-092, FR-097, FR-142, FR-143, NFR-010.
//
// The engine cannot observe a viewer or reach storage, which is what makes the
// hosted guarantees possible. These specifications assert the absence.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { engine, medium, runTicks } from '../helpers.js'

const engineSources = () => {
  const dir = new URL('../../src/', import.meta.url)
  return readdirSync(dir).filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n')
}

describe('US-E04-01 A run outlives the tab that started it', () => {
  it('The engine has no notion of a viewer', () => {
    const src = engineSources()
    for (const word of ['WebSocket', 'viewer', 'socket', 'subscribe(']) {
      expect(src.toLowerCase(), `the engine referred to ${word}`).not.toContain(word.toLowerCase())
    }
  })

  it('Advancing does not depend on anything outside the engine', async () => {
    const evs = await runTicks(engine(medium({ ticks: 300 })), 300)
    expect(evs.length).toBeGreaterThan(0)
  })
})

describe('US-E04-04 The simulation holds no storage credential', () => {
  it('The engine cannot reach storage or the network', () => {
    const src = engineSources()
    for (const word of ['fetch(', 'R2', 'S3', 'presign', 'Authorization', 'process.env']) {
      expect(src, `the engine referred to ${word}`).not.toContain(word)
    }
  })
})
