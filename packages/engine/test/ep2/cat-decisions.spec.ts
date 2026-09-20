// A cat must act on the answer it was given. ISSUE-013: the engine was
// recomputing its own heuristic and discarding the decision, so every cat
// request was paid for and thrown away and the record contradicted itself.
import { describe, it, expect } from 'vitest'
import {
  createEngine, baselineBatch, CAT,
  type AgentId, type DecisionBatch, type DecisionProvider, type DecisionRequest,
} from '../../src/index.js'
import { medium, runTicks, of } from '../helpers.js'

/** Answers every cat with a chosen target and mode, mice by the rules. */
function catProvider(choose: (req: DecisionRequest, id: AgentId) => {
  target: string; mode: string
} | null): DecisionProvider {
  return {
    decide: (requests) => {
      const out: Record<string, DecisionBatch> = {}
      for (const req of requests) {
        const base = baselineBatch(req, 0)
        out[req.batchId] = {
          ...base,
          source: 'jev',
          subjects: base.subjects.map((s) => {
            if (!s.agentId.startsWith('c')) return s
            const pick = choose(req, s.agentId)
            if (pick === null) return s
            const certain = (label: string): never => ({
              type: 'choice', choice: label, confidence: 1, probabilities: { [label]: 1 },
            } as never)
            return {
              ...s,
              intent: pick.mode as never,
              answers: { target: certain(pick.target), mode: certain(pick.mode) },
            }
          }),
        }
      }
      return Promise.resolve(out)
    },
  }
}

const config = medium({ cats: 3, mouseholes: 0, ticks: 20_000 })

describe('A cat acts on the decision it was given', () => {
  it('Goes only after a mouse it was told to go after', async () => {
    const asked = new Map<AgentId, Set<string>>()
    const cheapest = new Map<AgentId, Set<string>>()
    const e = createEngine({
      config,
      seed: 5,
      provider: catProvider((req, id) => {
        const ctx = req.contexts?.[id] as
          { candidates?: { id: string; distance: number; nutrition: number }[] } | undefined
        const candidates = ctx?.candidates ?? []
        // Answer whenever there is anyone to answer about. Declining would let
        // the baseline rules choose, and those targets are not recorded here.
        if (candidates.length === 0) return null
        // The last candidate on purpose. The engine's own heuristic picks the
        // cheapest, so honouring this proves the answer is what decides.
        const target = candidates[candidates.length - 1]?.id ?? ''
        const best = [...candidates].sort(
          (a, b) => (a.distance + a.nutrition / 20) - (b.distance + b.nutrition / 20))[0]
        if (!asked.has(id)) { asked.set(id, new Set()); cheapest.set(id, new Set()) }
        asked.get(id)?.add(target)
        if (best) cheapest.get(id)?.add(best.id)
        return { target, mode: 'stalk' }
      }),
    })
    const events = await runTicks(e, 200)
    const targeted = of(events, 'cat_targeted').filter((t) => t.target !== null)
    expect(targeted.length).toBeGreaterThan(0)

    // Nothing the engine invented, and at least one target the old heuristic
    // would never have chosen.
    const invented = targeted.filter((t) => !asked.get(t.id)?.has(t.target as string))
    expect(invented.map((t) => `${t.id} -> ${String(t.target)}`),
      'a cat took a target nobody asked for').toEqual([])
    const againstTheHeuristic = targeted.filter(
      (t) => !cheapest.get(t.id)?.has(t.target as string))
    expect(againstTheHeuristic.length,
      'every honoured target was also the cheapest, so this proves nothing')
      .toBeGreaterThan(0)
  }, 30_000)

  it('Takes the mode it was given rather than always stalking', async () => {
    const e = createEngine({
      config,
      seed: 5,
      provider: catProvider((req, id) => {
        const ctx = req.contexts?.[id] as { candidates?: { id: string }[] } | undefined
        const first = ctx?.candidates?.[0]
        return first ? { target: first.id, mode: 'rest' } : null
      }),
    })
    const events = await runTicks(e, 200)
    const rested = of(events, 'cat_targeted').filter((t) => t.mode === 'rest')
    expect(rested.length, 'a cat never took the mode it was given').toBeGreaterThan(0)
  }, 30_000)

  it('Chases nothing when told nothing is worth chasing', async () => {
    const e = createEngine({
      config,
      seed: 5,
      provider: catProvider(() => ({ target: 'none_worth_it', mode: 'prowl' })),
    })
    const events = await runTicks(e, 200)
    const targeted = of(events, 'cat_targeted')
    expect(targeted.length).toBeGreaterThan(0)
    expect(targeted.every((t) => t.target === null),
      'a cat took a target after being told none was worth it').toBe(true)
    // A prowling cat can still catch a mouse it walks onto; being told to chase
    // nobody is not a promise to catch nobody.
  }, 30_000)

  it('Can be given a mouse at the reach a hungry cat actually has', () => {
    // The engine used a fixed radius of 8 here while the rest of it, and the
    // request sent out, use 11 for a hungry cat.
    expect(CAT.perceptionHungry).toBeGreaterThan(CAT.perception)
  })
})
