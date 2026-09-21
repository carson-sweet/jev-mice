// The Worker's source must not reach for Node.
//
// The test config now includes node types, because the route-parity test reads
// the viewer's client off disk to compare surfaces. That makes it possible to
// import node:fs into the Worker itself and have it typecheck, and it would
// then fail only once deployed. This reads the source instead.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

describe('Running where there is no Node', () => {
  it('Imports nothing from Node anywhere in the source', () => {
    const dir = new URL('../src/', import.meta.url)
    const offenders: string[] = []
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const src = readFileSync(new URL(file, dir), 'utf8')
      if (/from '\s*node:/.test(src)) offenders.push(file)
    }
    expect(offenders, `these import from node: ${offenders.join(', ')}`).toEqual([])
    // The directory is read at all, so a passing test means something.
    expect(readdirSync(fileURLToPath(dir)).length).toBeGreaterThan(5)
  })
})
