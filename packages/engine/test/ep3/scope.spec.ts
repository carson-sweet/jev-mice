// The requirements' Out of Scope list, checked against the engine.
//
// "Cat mortality" sat in that list for two hours and fifteen commits after
// cats started starving, because nothing read the list back. Each exclusion
// below names the evidence that would prove it false, so an exclusion that the
// build has overtaken fails here instead of misleading the next reader.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SimEvent } from '../../src/index.js'
import { engine, medium, runTicks } from '../helpers.js'

const PRODUCT = join(import.meta.dirname, '../../../../.sweetclaude/product')

/** The requirements in force: exactly one file may be final. */
function currentRequirements(): string {
  const finals = readdirSync(PRODUCT)
    .filter((f) => /^jev-mice-prd-final-v.*\.md$/.test(f))
  expect(finals, 'there must be exactly one requirements document in force')
    .toHaveLength(1)
  return readFileSync(join(PRODUCT, finals[0] as string), 'utf8')
}

function exclusions(): string[] {
  const line = /Also excluded from this version: (.*)/.exec(currentRequirements())
  expect(line, 'could not find the Out of Scope list').not.toBeNull()
  return (line?.[1] ?? '').replace(/\.$/, '').split(';')
    .map((s) => s.trim().replace(/^and /, ''))
}

/**
 * An exclusion, and the event kind that would prove the engine has it after
 * all. Adding an exclusion means adding its evidence here, which is the point:
 * an exclusion nobody can disprove is an exclusion nobody will notice is stale.
 */
const DISPROVED_BY: Record<string, SimEvent['kind'] | null> = {
  'personality inheritance and the lineage view it would enable': null,
  'terrain and obstacles beyond mouseholes': null,
  'mice leaving a hole for any reason but hunger': null,
  'alarm chains beyond one hop': null,
  'teams, organizations, or any shared ownership of a run': null,
  'collaborative or simultaneous viewing controls, so a share viewer watches but never drives': null,
  'identity providers other than Google': null,
  'a mobile layout': null,
  'payment, billing, or per-person paid quotas': null,
  "any public listing or discovery of other people's runs": null,
  // Retired on 2026-09-20. Kept so that putting it back fails loudly.
  'cat mortality': 'cat_died',
}

describe("The requirements' Out of Scope list", () => {
  it('Names nothing the engine turns out to have', async () => {
    const listed = exclusions()
    const e = engine(medium({
      cats: 3, traps: 12, mouseholes: 20, foodPiles: 40, foodRespawnTicks: 10,
      maleMice: 0, femaleMice: 0, nutritionDecayPerTick: 1, ticks: 2_000,
    }))
    const kinds = new Set((await runTicks(e, 1_200)).map((x) => x.kind))

    const contradicted = listed.filter((x) => {
      const proof = DISPROVED_BY[x]
      return proof !== null && proof !== undefined && kinds.has(proof)
    })
    expect(contradicted, 'the build has overtaken these exclusions').toEqual([])
  }, 30_000)

  it('Has evidence recorded for every exclusion it names', () => {
    // A new exclusion with no entry here would pass the check above by default,
    // which is the hole this test closes.
    const missing = exclusions().filter((x) => !(x in DISPROVED_BY))
    expect(missing, 'add these to DISPROVED_BY, with the event that would '
      + 'disprove each or null where nothing in the engine can').toEqual([])
  })

  it('Keeps only one requirements document in force', () => {
    expect(currentRequirements().length).toBeGreaterThan(1_000)
  })
})
