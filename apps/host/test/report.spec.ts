// The report and the data dump for a finished run.
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { defaultConfig, type RunConfig, type SimEvent } from '@jev-mice/engine'
import { buildReport, renderReport, exportLines, type ReportSource } from '../src/report.js'

const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

const config: RunConfig = { ...defaultConfig('medium') }

/** A run on disk with the events and per-turn points given. */
function stored(o: {
  events: SimEvent[]
  turns?: number
  config?: RunConfig
}): ReportSource {
  const root = mkdtempSync(join(tmpdir(), 'jev-report-'))
  dirs.push(root)
  mkdirSync(join(root, 'chunks'), { recursive: true })
  mkdirSync(join(root, 'summary'), { recursive: true })
  const turns = o.turns ?? 10
  writeFileSync(join(root, 'chunks', '0.json.gz'), gzipSync(JSON.stringify({
    runId: 'r', seq: 0, firstTick: 1, lastTick: turns, events: o.events,
  })))
  writeFileSync(join(root, 'summary', '0.json.gz'), gzipSync(JSON.stringify({
    runId: 'r', seq: 0,
    points: Array.from({ length: turns }, (_, i) => ({
      tick: i + 1, population: 10 - i, cats: 2, food: 5, traps: 3,
      births: 0, deathsByStarvation: 0, deathsByTrap: 0, deathsByCat: 0,
      meanNutrition: 50, judged: 0, fallbacks: 0,
    })),
  })))
  return {
    run: {
      id: root, seed: 99, config: o.config ?? config, createdAt: '2026-09-20T10:00:00.000Z',
      status: 'completed', endReason: 'completed', decidedBy: 'rules',
      currentTick: turns, speed: 1,
      population: { mice: { peak: 10, min: 1, current: 1 },
                    cats: { peak: 2, min: 2, current: 2 } },
      totals: { currentTick: turns, requests: 0, inputTokens: 0, fallbackCount: 4,
                population: { mice: { peak: 10, min: 1, current: 1 },
                              cats: { peak: 2, min: 2, current: 2 } } },
      chunks: [{ seq: 0, firstTick: 1, lastTick: turns, bytesGzip: 100 }],
      error: null, queuePosition: null,
    } as never,
    stored: {
      id: root,
      chunks: [{ seq: 0, firstTick: 1, lastTick: turns }],
      chunkPath: (seq) => join(root, 'chunks', `${String(seq)}.json.gz`),
      summaryPath: (seq) => join(root, 'summary', `${String(seq)}.json.gz`),
      totalTurns: turns,
    },
  }
}

const ev = (kind: string, tick: number, rest: Record<string, unknown> = {}): SimEvent =>
  ({ kind, tick, seq: tick, ...rest } as never)

/** A decision event whose subject qualifies for the flee-or-hide measure. */
const threatened = (tick: number, flee: number, hide: number): SimEvent => ev(
  'decision_returned', tick, {
    batchId: `b${String(tick)}`, source: 'jev', latencyMs: 5,
    subjects: [{
      agentId: `m${String(tick).padStart(4, '0')}`,
      state: {
        mouse: { hunger: 'fed' },
        surroundings: { cats: 'a cat very close to the north, stalking toward you' },
      },
      options: ['flee', 'explore'],
      answers: { drive: { type: 'choice', choice: 'flee', confidence: 0.8,
                          probabilities: { flee, hide, explore: 1 - flee - hide } } },
      intent: 'flee', lowConfidence: false, fear: 'alarmed',
      weights: { flee, hide, explore: 1 - flee - hide },
    }],
  })

describe('The report for a run', () => {
  it('Answers both behavioural measures', async () => {
    const source = stored({ events: [threatened(1, 0.6, 0.1), threatened(2, 0.1, 0.1)] })
    const report = await buildReport(source)
    expect(report.measures.fleeOrHide.qualifying).toBe(2)
    expect(report.measures.fleeOrHide.passing).toBe(1)
    expect(report.measures.fleeOrHide.rate).toBeCloseTo(0.5, 6)
    expect(report.measures.personalityMix.everAlive).toBe(0)
  })

  it('Says a measure has no verdict when the sample is too small', async () => {
    const source = stored({ events: [threatened(1, 0.9, 0)] })
    const report = await buildReport(source)
    expect(report.measures.fleeOrHide.applies).toBe(false)
    expect(report.measures.fleeOrHide.verdict).toBe('not enough evidence')
  })

  it('Gives a verdict once there is enough evidence', async () => {
    const events = Array.from({ length: 120 }, (_, i) => threatened(i + 1, 0.9, 0))
    const report = await buildReport(stored({ events, turns: 120 }))
    expect(report.measures.fleeOrHide.applies).toBe(true)
    expect(report.measures.fleeOrHide.verdict).toBe('met')
  })

  it('Says plainly when a measure is not met', async () => {
    const events = Array.from({ length: 120 }, (_, i) => threatened(i + 1, 0.1, 0.1))
    const report = await buildReport(stored({ events, turns: 120 }))
    expect(report.measures.fleeOrHide.verdict).toBe('not met')
  })

  it('Counts the deaths by cause and the births', async () => {
    const source = stored({ events: [
      ev('death', 1, { id: 'm0001', cause: 'starvation' }),
      ev('death', 2, { id: 'm0002', cause: 'cat' }),
      ev('death', 3, { id: 'm0003', cause: 'trap' }),
      ev('death', 4, { id: 'm0004', cause: 'cat' }),
      ev('birth', 5, { motherId: 'm0005', pupId: 'm0100', personality: 'bold', sex: 'male' }),
      ev('cat_died', 6, { id: 'c0001', cause: 'starvation', nutrition: 0, at: { x: 1, y: 1 } }),
    ] })
    const report = await buildReport(source)
    expect(report.deaths).toEqual({ starvation: 1, cat: 2, trap: 1 })
    expect(report.births).toBe(1)
    expect(report.catsStarved).toBe(1)
  })

  it('Carries what the run was started from, so it can be repeated', async () => {
    const report = await buildReport(stored({ events: [] }))
    expect(report.seed).toBe(99)
    expect(report.config).toEqual(config)
    expect(report.decidedBy).toBe('rules')
  })

  it('Reads as a document a person can keep', async () => {
    const report = await buildReport(stored({ events: [threatened(1, 0.9, 0)] }))
    const text = renderReport(report)
    expect(text).toContain('# jev-mice run')
    expect(text).toMatch(/seed 99/i)
    expect(text).toContain('SM-06')
    expect(text).toContain('SM-07')
    // No framework vocabulary, and no emoji.
    expect(text).not.toMatch(/phase gate|exit criteria|deference/i)
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u)
  })
})

describe('The data dump', () => {
  it('Writes one line of metadata and then one line per event', async () => {
    const source = stored({ events: [
      ev('death', 1, { id: 'm0001', cause: 'starvation' }),
      ev('birth', 2, { motherId: 'm0005', pupId: 'm0100', personality: 'bold', sex: 'male' }),
    ] })
    const lines: string[] = []
    for await (const line of exportLines(source)) lines.push(line.trimEnd())
    expect(lines).toHaveLength(3)
    const head = JSON.parse(lines[0] as string) as { kind: string; seed: number }
    expect(head.kind).toBe('run')
    expect(head.seed).toBe(99)
    for (const line of lines.slice(1)) {
      expect(() => JSON.parse(line) as unknown).not.toThrow()
    }
    expect((JSON.parse(lines[1] as string) as { kind: string }).kind).toBe('death')
  })

  it('Keeps every event, in turn order', async () => {
    const events = Array.from({ length: 50 }, (_, i) =>
      ev('food_eaten', i + 1, { id: 'm0001', foodId: 'f0001' }))
    const lines: string[] = []
    for await (const line of exportLines(stored({ events, turns: 50 }))) lines.push(line)
    const ticks = lines.slice(1).map((l) => (JSON.parse(l) as { tick: number }).tick)
    expect(ticks).toEqual(ticks.slice().sort((a, b) => a - b))
    expect(ticks).toHaveLength(50)
  })

  it('Survives a run whose chunk is missing, rather than failing', async () => {
    const source = stored({ events: [] })
    rmSync(source.stored.chunkPath(0))
    const lines: string[] = []
    for await (const line of exportLines(source)) lines.push(line)
    expect(lines).toHaveLength(1)
  })

  it('Is gzip-safe: what comes out parses back', async () => {
    const source = stored({ events: [ev('food_eaten', 1, { id: 'm0001', foodId: 'f0001' })] })
    const parts: string[] = []
    for await (const line of exportLines(source)) parts.push(line)
    const round = gunzipSync(gzipSync(parts.join(''))).toString('utf8')
    expect(round.trimEnd().split('\n')).toHaveLength(2)
  })
})
