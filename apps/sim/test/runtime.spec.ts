// The simulation loop has to run on the Workers runtime as well as on Node,
// because the engine now advances inside the Run Durable Object rather than in
// a container (ADR-025). Workers have no node:zlib and no Buffer.
//
// This guard reads the source rather than exercising the loop because the two
// failures it catches are invisible at runtime under Node: an import that only
// breaks once deployed, and a Buffer call that works perfectly in every test.
// That the chunks are still real gzip is proved by sim.spec.ts, which gunzips
// every upload it makes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')

describe('Running the loop where there is no Node', () => {
  it('Imports nothing from Node', () => {
    expect(source).not.toMatch(/from '\s*node:/)
  })

  it('Does not reach for Buffer', () => {
    expect(source).not.toMatch(/\bBuffer\./)
  })
})
