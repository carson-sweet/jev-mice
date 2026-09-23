import { describe, it, expect } from 'vitest'
import {
  composeRequests, defaultConfig, createEngine, FEAR_LEVELS,
  type DecisionRequest,
} from '@jev-mice/engine'
import { jevProvider, type SystemOneLike } from '../src/index.js'

// A world one tick in, so the requests carry real mice with real surroundings.
function requests(): DecisionRequest[] {
  const e = createEngine({ config: { ...defaultConfig('medium'), cats: 2 }, seed: 7, provider: stub() })
  const view = e.world()
  // Mice fill one batch and the cats form a second, so the batch-level
  // behaviour has more than one batch to be true of.
  const ready = [...view.mice.slice(0, 8), ...view.cats].map((a) => a.id)
  let n = 0
  return composeRequests(view, ready, () => `b${++n}`)
}

function stub(): { decide: () => Promise<Record<string, never>> } {
  return { decide: () => Promise.resolve({}) }
}

/** A fake service that answers whatever it is asked, recording what it received. */
function fake(opts: {
  drive?: string
  confidence?: number
  fear?: number
  fail?: 'throw' | 'hang'
  seen?: unknown[]
} = {}): SystemOneLike {
  return {
    systemOne(req) {
      opts.seen?.push(req)
      if (opts.fail === 'throw') return Promise.reject(new Error('upstream refused'))
      if (opts.fail === 'hang') return new Promise(() => {})
      const answers: Record<string, unknown> = {}
      for (const [name, q] of Object.entries(req.questions as Record<string, { type: string; criteria: unknown }>)) {
        if (q.type === 'choice') {
          const labels = Object.keys(q.criteria as Record<string, unknown>)
          const chosen = opts.drive && labels.includes(opts.drive) ? opts.drive : labels[0]
          const conf = opts.confidence ?? 0.8
          const rest = labels.length > 1 ? (1 - conf) / (labels.length - 1) : 0
          const probabilities: Record<string, number> = {}
          for (const l of labels) probabilities[l] = l === chosen ? conf : rest
          answers[name] = { type: 'choice', choice: chosen, confidence: conf, probabilities }
        } else if (q.type === 'score') {
          const levels = (q.criteria as unknown[]).length
          const score = opts.fear ?? 0
          const probabilities: Record<string, number> = {}
          for (let i = 0; i < levels; i++) probabilities[i] = i === score ? 0.9 : 0.1 / (levels - 1)
          answers[name] = { type: 'score', score, confidence: 0.9, probabilities, legend: {} }
        } else {
          answers[name] = { type: 'noul', noul: 0.5 }
        }
      }
      return Promise.resolve({ model: 'jev-test', answers, usage: { input_tokens: 400, output_tokens: 20 } })
    },
  }
}

describe('The Jev decision provider', () => {
  it('Sends each batch as one request carrying its state and questions unchanged', async () => {
    const seen: unknown[] = []
    const reqs = requests()
    await jevProvider(fake({ seen })).decide(reqs)

    expect(seen).toHaveLength(reqs.length)
    for (let i = 0; i < reqs.length; i++) {
      const sent = seen[i] as { state: unknown; questions: unknown }
      expect(sent.state).toEqual(reqs[i]?.state)
      expect(sent.questions).toEqual(reqs[i]?.questions)
    }
  })

  it('Never sends the private rule context to the service', async () => {
    const seen: unknown[] = []
    const reqs = requests()
    expect(reqs.some((r) => r.contexts !== undefined)).toBe(true)
    await jevProvider(fake({ seen })).decide(reqs)
    for (const sent of seen) {
      expect(Object.keys(sent as object)).not.toContain('contexts')
      expect(JSON.stringify(sent)).not.toContain('nearestCat')
    }
  })

  it('Answers every agent it was asked about', async () => {
    const reqs = requests()
    const out = await jevProvider(fake()).decide(reqs)
    for (const r of reqs) {
      const ids = (out[r.batchId]?.subjects ?? []).map((s) => s.agentId).sort()
      expect(ids).toEqual([...r.agents].sort())
    }
  })

  it('Turns the choice probabilities into the movement weights whole', async () => {
    const reqs = requests()
    const out = await jevProvider(fake({ drive: 'explore' })).decide(reqs)
    const mouse = Object.values(out).flatMap((b) => b.subjects).find((s) => s.agentId.startsWith('m'))
    expect(mouse).toBeDefined()
    expect(mouse!.intent).toBe('explore')
    const total = Object.values(mouse!.weights).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 6)
    expect(mouse!.weights.explore).toBeCloseTo(0.8, 6)
  })

  it('Records a cat mode as its intent rather than its target id', async () => {
    const out = await jevProvider(fake()).decide(requests())
    const cat = Object.values(out).flatMap((batch) => batch.subjects)
      .find((subject) => subject.agentId.startsWith('c'))
    expect(cat).toBeDefined()
    expect(cat?.intent).toBe((cat?.answers.mode as { choice?: string } | undefined)?.choice)
    expect(cat?.intent).not.toMatch(/^m/)
  })

  it('Flags an answer the service is not confident about', async () => {
    const sure = await jevProvider(fake({ confidence: 0.8 })).decide(requests())
    const unsure = await jevProvider(fake({ confidence: 0.4 })).decide(requests())
    const flag = (o: Awaited<ReturnType<ReturnType<typeof jevProvider>['decide']>>) =>
      Object.values(o).flatMap((b) => b.subjects).some((s) => s.lowConfidence)
    expect(flag(sure)).toBe(false)
    expect(flag(unsure)).toBe(true)
  })

  it('Reads the fear level off the rubric position', async () => {
    for (let i = 0; i < FEAR_LEVELS.length; i++) {
      const out = await jevProvider(fake({ fear: i })).decide(requests())
      const mouse = Object.values(out).flatMap((b) => b.subjects).find((s) => s.agentId.startsWith('m'))
      expect(mouse!.fear).toBe(FEAR_LEVELS[i])
    }
  })

  it('Reports the batch as judged, with the model and what it cost', async () => {
    const out = await jevProvider(fake()).decide(requests())
    for (const batch of Object.values(out)) {
      expect(batch.source).toBe('jev')
      expect(batch.model).toBe('jev-test')
      expect(batch.inputTokens).toBe(400)
      expect(batch.latencyMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('Falls back to the rules for a batch the service refuses', async () => {
    const out = await jevProvider(fake({ fail: 'throw' })).decide(requests())
    for (const batch of Object.values(out)) {
      expect(batch.source).toBe('baseline')
      expect(batch.subjects.length).toBeGreaterThan(0)
    }
  })

  it('Falls back to the rules when the service does not answer in time', async () => {
    const out = await jevProvider(fake({ fail: 'hang' }), { timeoutMs: 50 }).decide(requests())
    for (const batch of Object.values(out)) expect(batch.source).toBe('baseline')
  }, 10_000)

  it('Keeps a good batch when a sibling batch fails', async () => {
    let call = 0
    const flaky: SystemOneLike = {
      systemOne: (req) => (++call === 1
        ? Promise.reject(new Error('upstream refused'))
        : fake().systemOne(req)),
    }
    const reqs = requests()
    expect(reqs.length).toBeGreaterThan(1)
    const out = await jevProvider(flaky).decide(reqs)
    const sources = reqs.map((r) => out[r.batchId]?.source)
    expect(sources[0]).toBe('baseline')
    expect(sources.slice(1).every((s) => s === 'jev')).toBe(true)
  })

  it('Falls back the whole batch when one required answer is missing', async () => {
    const incomplete: SystemOneLike = {
      async systemOne(req) {
        const answered = await fake().systemOne(req)
        const firstFear = Object.keys(answered.answers).find((name) => name.startsWith('fear_'))
        if (firstFear !== undefined) delete answered.answers[firstFear]
        return answered
      },
    }
    const out = await jevProvider(incomplete).decide(requests())
    const mouseBatch = Object.values(out).find((batch) =>
      batch.subjects.some((subject) => subject.agentId.startsWith('m')))
    expect(mouseBatch?.source).toBe('baseline')
    expect(mouseBatch?.fallbackReason).toBe('error')
  })

  it('Falls back rather than accepting a choice outside the offered labels', async () => {
    const invented: SystemOneLike = {
      async systemOne(req) {
        const answered = await fake().systemOne(req)
        const firstChoice = Object.keys(answered.answers).find((name) => name.startsWith('drive_'))
        if (firstChoice !== undefined) {
          answered.answers[firstChoice] = {
            type: 'choice', choice: 'teleport', confidence: 1, probabilities: { teleport: 1 },
          }
        }
        return answered
      },
    }
    const out = await jevProvider(invented).decide(requests())
    expect(Object.values(out).some((batch) => batch.fallbackReason === 'error')).toBe(true)
  })
})
