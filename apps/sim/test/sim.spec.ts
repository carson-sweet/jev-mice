import { describe, it, expect } from 'vitest'
import { gunzipSync } from 'node:zlib'
import {
  defaultConfig, baselineProvider, type Engine, type RunConfig, type Snapshot,
} from '@jev-mice/engine'
import {
  createSimulation, CHUNK_TICKS, FRAMES_PER_SECOND, dueForFrame,
  type ChunkAck, type ChunkBody, type ChunkReport, type Coordinator, type Frame,
  type EndReason, type LogEntry, type SummaryBody,
} from '../src/index.js'

const ack = (over: Partial<ChunkAck> = {}): ChunkAck => ({
  // Zero means unthrottled; a positive speed is a multiple of thirty ticks a second.
  control: { desired: 'run', speed: 0, seq: 0 },
  allowance: { tokens: 1_000_000, degraded: false },
  rate: { requestsPerMinute: 600 },
  presigned: { chunk: 'put:chunk', summary: 'put:summary', snapshot: 'put:snapshot',
               expiresAt: '2099-01-01T00:00:00Z' },
  ...over,
})

interface Recorded {
  puts: { url: string; body: Uint8Array }[]
  reports: ChunkReport[]
  frames: Frame[][]
  done: { finalTick: number; totals: ChunkReport['totals']; reason: EndReason }[]
  failed: { atTick: number; reason: string }[]
}

function harness(over: {
  config?: Partial<RunConfig>
  ackFor?: (report: ChunkReport | null) => ChunkAck
  onReport?: (r: ChunkReport, rec: Recorded) => void
  onUpload?: (url: string) => void
  capture?: (engine: Engine) => void
} = {}) {
  const rec: Recorded = { puts: [], reports: [], frames: [], done: [], failed: [] }
  const answer = over.ackFor ?? (() => ack())
  const coordinator: Coordinator = {
    ready: () => Promise.resolve(answer(null)),
    chunk: (r) => { rec.reports.push(r); over.onReport?.(r, rec); return Promise.resolve(answer(r)) },
    frames: (f) => { rec.frames.push(f); return Promise.resolve() },
    done: (d) => { rec.done.push(d); return Promise.resolve() },
    failed: (f) => { rec.failed.push(f); return Promise.resolve() },
  }
  const sim = createSimulation({
    runId: 'r1',
    config: { ...defaultConfig('small'), ticks: 600, ...over.config },
    seed: 11,
    coordinator,
    upload: (url, body) => {
      rec.puts.push({ url, body }); over.onUpload?.(url); return Promise.resolve()
    },
    provider: () => baselineProvider(),
    ...(over.capture ? { onEngine: over.capture } : {}),
  })
  return { sim, rec }
}

const chunkBodies = (rec: Recorded): unknown[] =>
  rec.puts.filter((p) => p.url === 'put:chunk')
    .map((p) => JSON.parse(gunzipSync(p.body).toString('utf8')) as unknown)

describe('The simulation process', () => {
  it('Runs to the configured tick count and reports it finished', async () => {
    const { sim, rec } = harness({ config: { ticks: 300 } })
    await sim.start()
    expect(rec.failed).toHaveLength(0)
    expect(rec.done).toHaveLength(1)
    expect(rec.done[0]?.finalTick).toBe(300)
  })

  it('Closes a chunk every two hundred and fifty ticks', async () => {
    const { sim, rec } = harness({ config: { ticks: 600 } })
    await sim.start()
    expect(rec.reports.map((r) => r.seq)).toEqual([0, 1, 2])
    expect(rec.reports.map((r) => r.lastTick)).toEqual([CHUNK_TICKS, CHUNK_TICKS * 2, 600])
  })

  it('Leaves no gap and no repeated tick between chunks', async () => {
    const { sim, rec } = harness({ config: { ticks: 600 } })
    await sim.start()
    for (let i = 1; i < rec.reports.length; i++) {
      expect(rec.reports[i]?.firstTick).toBe((rec.reports[i - 1]?.lastTick ?? 0) + 1)
    }
    const bodies = chunkBodies(rec) as { events: { tick: number }[] }[]
    const ticks = bodies.flatMap((b) => b.events.map((e) => e.tick))
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
  })

  it('Uploads the chunk, then the summary, then the snapshot, then reports', async () => {
    const order: string[] = []
    const { sim } = harness({
      config: { ticks: 250 },
      onUpload: (url) => { order.push(url) },
      onReport: () => { order.push('report') },
    })
    await sim.start()
    expect(order).toEqual(['put:chunk', 'put:summary', 'put:snapshot', 'report'])
  })

  it('Gzips what it uploads', async () => {
    const { sim, rec } = harness({ config: { ticks: 250 } })
    await sim.start()
    const chunk = rec.puts.find((p) => p.url === 'put:chunk')
    expect(chunk).toBeDefined()
    expect(chunk!.body[0]).toBe(0x1f)
    expect(chunk!.body[1]).toBe(0x8b)
    const parsed = JSON.parse(gunzipSync(chunk!.body).toString('utf8')) as { events: unknown[] }
    expect(parsed.events.length).toBeGreaterThan(0)
    expect(chunk!.body.byteLength).toBeLessThan(
      Buffer.byteLength(JSON.stringify(parsed), 'utf8'))
  })

  it('Reports sizes and counts that match what it uploaded, and never a key', async () => {
    const { sim, rec } = harness({ config: { ticks: 250 } })
    await sim.start()
    const report = rec.reports[0]
    const chunk = rec.puts.find((p) => p.url === 'put:chunk')
    expect(report?.bytesGzip).toBe(chunk?.body.byteLength)
    expect(report?.bytesRaw).toBeGreaterThan(report!.bytesGzip)
    expect(JSON.stringify(report)).not.toContain('runs/')
    expect(Object.keys(report as object)).not.toContain('key')
  })

  it('Carries running totals forward across chunks', async () => {
    const { sim, rec } = harness({ config: { ticks: 600 } })
    await sim.start()
    const totals = rec.reports.map((r) => r.totals.currentTick)
    expect(totals).toEqual([CHUNK_TICKS, CHUNK_TICKS * 2, 600])
    for (let i = 1; i < rec.reports.length; i++) {
      expect(rec.reports[i]!.totals.requests)
        .toBeGreaterThanOrEqual(rec.reports[i - 1]!.totals.requests)
    }
  })

  it('Pushes frames so a viewer has something to draw before the first chunk', async () => {
    const { sim, rec } = harness({ config: { ticks: 250 } })
    await sim.start()
    expect(rec.frames.length).toBeGreaterThan(1)
    // A flush carrying only log lines sends an empty frame batch, so the first
    // frame is the first one in a batch that has any.
    const first = rec.frames.flat()[0]
    expect(first?.tick).toBeGreaterThan(0)
    expect(Array.isArray(first?.mice)).toBe(true)
  })

  it('Stops where it is told to stop', async () => {
    const { sim, rec } = harness({
      config: { ticks: 10_000 },
      ackFor: (r) => (r === null ? ack() : ack({ control: { desired: 'stop', speed: 0, seq: 1 } })),
    })
    await sim.start()
    expect(rec.done[0]?.finalTick).toBe(CHUNK_TICKS)
  })

  it('Applies a pushed pause at the next tick, not at the next chunk', async () => {
    const { sim, rec } = harness({ config: { ticks: 10_000 } })
    const running = sim.start()
    await new Promise((r) => setTimeout(r, 20))
    sim.control({ desired: 'pause', speed: 0, seq: 1 })
    await new Promise((r) => setTimeout(r, 40))
    const held = sim.currentTick()
    await new Promise((r) => setTimeout(r, 60))
    expect(sim.currentTick()).toBe(held)
    expect(held).toBeLessThan(10_000)
    sim.control({ desired: 'stop', speed: 0, seq: 2 })
    await running
    expect(rec.done).toHaveLength(1)
  }, 15_000)

  it('Sends a frame the moment it pauses, so the page shows where it stopped', async () => {
    const seen: Frame[] = []
    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ack({ control: { desired: 'run', speed: 334, seq: 0 } })),
      chunk: () => Promise.resolve(ack({ control: { desired: 'run', speed: 334, seq: 0 } })),
      frames: (f) => { seen.push(...f); return Promise.resolve() },
      done: () => Promise.resolve(),
      failed: () => Promise.resolve(),
    }
    const sim = createSimulation({
      runId: 'pause', config: { ...defaultConfig('small'), ticks: 20_000 }, seed: 3,
      coordinator, upload: () => Promise.resolve(), provider: () => baselineProvider(),
    })
    const running = sim.start()
    await new Promise((r) => setTimeout(r, 200))
    sim.control({ desired: 'pause', speed: 334, seq: 1 })
    await new Promise((r) => setTimeout(r, 200))
    // Without this the last frame is up to seventeen turns behind where the
    // run actually stopped, and a step from there looks like a jump.
    expect(seen.at(-1)?.tick).toBe(sim.currentTick())
    sim.control({ desired: 'stop', speed: 334, seq: 2 })
    await running
  }, 20_000)

  it('Sends a frame for a stepped turn, whatever the frame interval is', async () => {
    // A step exists so someone can look at the result. At speed 334 a frame is
    // only due every seventeenth tick, so without this a step showed nothing.
    const seen: Frame[] = []
    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ack({ control: { desired: 'run', speed: 334, seq: 0 } })),
      chunk: () => Promise.resolve(ack({ control: { desired: 'run', speed: 334, seq: 0 } })),
      frames: (f) => { seen.push(...f); return Promise.resolve() },
      done: () => Promise.resolve(),
      failed: () => Promise.resolve(),
    }
    const sim = createSimulation({
      runId: 'step', config: { ...defaultConfig('small'), ticks: 20_000 }, seed: 3,
      coordinator, upload: () => Promise.resolve(), provider: () => baselineProvider(),
    })
    const running = sim.start()
    sim.control({ desired: 'pause', speed: 334, seq: 1 })
    await new Promise((r) => setTimeout(r, 150))
    const before = seen.length
    const tickBefore = sim.currentTick()
    sim.control({ desired: 'step', speed: 334, seq: 2 })
    await new Promise((r) => setTimeout(r, 200))
    expect(sim.currentTick()).toBe(tickBefore + 1)
    expect(seen.length).toBeGreaterThan(before)
    expect(seen.at(-1)?.tick).toBe(tickBefore + 1)
    sim.control({ desired: 'stop', speed: 334, seq: 3 })
    await running
  }, 20_000)

  it('Advances exactly one tick on a step from a pause', async () => {
    const { sim } = harness({ config: { ticks: 10_000 } })
    const running = sim.start()
    sim.control({ desired: 'pause', speed: 0, seq: 1 })
    await new Promise((r) => setTimeout(r, 40))
    const before = sim.currentTick()
    sim.control({ desired: 'step', speed: 0, seq: 2 })
    await new Promise((r) => setTimeout(r, 40))
    expect(sim.currentTick()).toBe(before + 1)
    sim.control({ desired: 'stop', speed: 0, seq: 3 })
    await running
  }, 15_000)

  it('Ignores a control message it has already seen', async () => {
    const { sim } = harness({ config: { ticks: 10_000 } })
    const running = sim.start()
    sim.control({ desired: 'pause', speed: 0, seq: 5 })
    await new Promise((r) => setTimeout(r, 30))
    const held = sim.currentTick()
    sim.control({ desired: 'run', speed: 0, seq: 3 })
    await new Promise((r) => setTimeout(r, 50))
    expect(sim.currentTick()).toBe(held)
    sim.control({ desired: 'stop', speed: 0, seq: 9 })
    await running
  }, 15_000)

  it('Falls back to the rules when the allowance runs out', async () => {
    const used: boolean[] = []
    const rec: Recorded = { puts: [], reports: [], frames: [], done: [], failed: [] }
    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ack()),
      chunk: (r) => {
        rec.reports.push(r)
        return Promise.resolve(ack({
          allowance: { tokens: 0, degraded: true, reason: 'quota' },
        }))
      },
      frames: () => Promise.resolve(),
      done: (d) => { rec.done.push(d); return Promise.resolve() },
      failed: (f) => { rec.failed.push(f); return Promise.resolve() },
    }
    const sim = createSimulation({
      runId: 'r1',
      config: { ...defaultConfig('small'), ticks: 500 },
      seed: 11,
      coordinator,
      upload: () => Promise.resolve(),
      provider: (o) => { used.push(o.degraded); return baselineProvider() },
    })
    await sim.start()
    // Asked once at the start, then again after the allowance was withdrawn.
    expect(used[0]).toBe(false)
    expect(used).toContain(true)
  })

  it('Reports a failure instead of a completion when the engine throws', async () => {
    const rec: Recorded = { puts: [], reports: [], frames: [], done: [], failed: [] }
    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ack()),
      chunk: () => Promise.reject(new Error('coordinator is gone')),
      frames: () => Promise.resolve(),
      done: (d) => { rec.done.push(d); return Promise.resolve() },
      failed: (f) => { rec.failed.push(f); return Promise.resolve() },
    }
    const sim = createSimulation({
      runId: 'r1',
      config: { ...defaultConfig('small'), ticks: 400 },
      seed: 11,
      coordinator,
      upload: () => Promise.resolve(),
      provider: () => baselineProvider(),
    })
    await sim.start()
    expect(rec.done).toHaveLength(0)
    expect(rec.failed).toHaveLength(1)
    expect(rec.failed[0]?.reason).toContain('coordinator is gone')
  })

  it('Resumes from a snapshot without repeating a tick', async () => {
    const { sim, rec } = harness({ config: { ticks: 250 } })
    await sim.start()
    const snap = rec.puts.filter((p) => p.url === 'put:snapshot').at(-1)
    expect(snap).toBeDefined()
    const state = JSON.parse(gunzipSync(snap!.body).toString('utf8')) as Snapshot & { tick: number }
    expect(state.tick).toBe(250)

    const second = harness({ config: { ticks: 500 } })
    await second.sim.start({ snapshot: state })
    expect(second.rec.reports[0]?.firstTick).toBe(251)
    expect(second.rec.done[0]?.finalTick).toBe(500)
  })
})

describe('Simulation speed', () => {
  it('Runs as fast as it can when no speed is asked for', async () => {
    const { sim } = harness({ config: { ticks: 400 } })
    const started = Date.now()
    await sim.start()
    expect(Date.now() - started).toBeLessThan(4_000)
    expect(sim.currentTick()).toBe(400)
  }, 20_000)

  it('Paces itself at the ticks a second it was given', async () => {
    const { sim } = harness({
      config: { ticks: 20_000 },
      ackFor: () => ack({ control: { desired: 'run', speed: 40, seq: 0 } }),
    })
    const running = sim.start()
    await new Promise((r) => setTimeout(r, 1_000))
    const reached = sim.currentTick()
    sim.control({ desired: 'stop', speed: 40, seq: 9 })
    await running
    // Forty a second for about a second. Loose bounds: this is a pacing
    // control, not a real-time guarantee, and a slow machine may undershoot.
    expect(reached).toBeGreaterThan(10)
    expect(reached).toBeLessThan(120)
  }, 20_000)

  it('Goes faster when asked to go faster', async () => {
    const reach = async (speed: number): Promise<number> => {
      const { sim } = harness({
        config: { ticks: 20_000 },
        ackFor: () => ack({ control: { desired: 'run', speed, seq: 0 } }),
      })
      const running = sim.start()
      await new Promise((r) => setTimeout(r, 800))
      const n = sim.currentTick()
      sim.control({ desired: 'stop', speed, seq: 9 })
      await running
      return n
    }
    const slow = await reach(5)
    const fast = await reach(200)
    expect(fast).toBeGreaterThan(slow * 3)
  }, 30_000)

  it('Changes pace without restarting, when the speed is pushed mid-run', async () => {
    const { sim } = harness({
      config: { ticks: 20_000 },
      ackFor: () => ack({ control: { desired: 'run', speed: 2, seq: 0 } }),
    })
    const running = sim.start()
    await new Promise((r) => setTimeout(r, 500))
    const crawling = sim.currentTick()
    sim.control({ desired: 'run', speed: 300, seq: 5 })
    await new Promise((r) => setTimeout(r, 500))
    const sprinting = sim.currentTick() - crawling
    sim.control({ desired: 'stop', speed: 300, seq: 6 })
    await running
    expect(crawling).toBeLessThan(20)
    expect(sprinting).toBeGreaterThan(crawling)
  }, 20_000)

  it('Does not lose the pace budget while paused', async () => {
    const { sim } = harness({
      config: { ticks: 20_000 },
      ackFor: () => ack({ control: { desired: 'run', speed: 20, seq: 0 } }),
    })
    const running = sim.start()
    sim.control({ desired: 'pause', speed: 20, seq: 1 })
    await new Promise((r) => setTimeout(r, 600))
    const held = sim.currentTick()
    sim.control({ desired: 'run', speed: 20, seq: 2 })
    await new Promise((r) => setTimeout(r, 200))
    // A pause must not bank six hundred milliseconds of ticks and spend them
    // all at once the moment it resumes.
    expect(sim.currentTick() - held).toBeLessThan(40)
    sim.control({ desired: 'stop', speed: 20, seq: 3 })
    await running
  }, 20_000)
})

describe('How often a watcher hears anything', () => {
  it('Sends a frame promptly even at the slowest pace', async () => {
    const rec: { at: number; tick: number }[] = []
    const started = Date.now()
    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ack({ control: { desired: 'run', speed: 1, seq: 0 } })),
      chunk: () => Promise.resolve(ack({ control: { desired: 'run', speed: 1, seq: 0 } })),
      frames: (f) => {
        for (const x of f) rec.push({ at: Date.now() - started, tick: x.tick })
        return Promise.resolve()
      },
      done: () => Promise.resolve(),
      failed: () => Promise.resolve(),
    }
    const sim = createSimulation({
      runId: 'slow',
      config: { ...defaultConfig('small'), ticks: 20_000 },
      seed: 4,
      coordinator,
      upload: () => Promise.resolve(),
      provider: () => baselineProvider(),
    })
    const running = sim.start()
    await new Promise((r) => setTimeout(r, 2_500))
    sim.control({ desired: 'stop', speed: 1, seq: 9 })
    await running
    // One tick a second for two and a half seconds. A watcher must see the
    // first tick within about a second, not wait for a batch of twenty.
    expect(rec.length).toBeGreaterThanOrEqual(2)
    expect(rec[0]?.at).toBeLessThan(1_800)
    expect(rec[0]?.tick).toBe(1)
  }, 20_000)

  it('Does not drown a watcher when running flat out', async () => {
    const batches: number[] = []
    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ack()),
      chunk: () => Promise.resolve(ack()),
      frames: (f) => { batches.push(f.length); return Promise.resolve() },
      done: () => Promise.resolve(),
      failed: () => Promise.resolve(),
    }
    const sim = createSimulation({
      runId: 'fast',
      config: { ...defaultConfig('small'), ticks: 3_000 },
      seed: 4,
      coordinator,
      upload: () => Promise.resolve(),
      provider: () => baselineProvider(),
    })
    await sim.start()
    const sent = batches.reduce((a, b) => a + b, 0)
    expect(sent).toBeGreaterThan(0)
    // Far fewer frames than ticks, or a fast run would flood the socket.
    expect(sent).toBeLessThan(3_000 / 2)
  }, 20_000)
})

describe('The running log', () => {
  const logFrom = async (over: Parameters<typeof harness>[0] = {}) => {
    const entries: LogEntry[] = []
    const rec: Recorded = { puts: [], reports: [], frames: [], done: [], failed: [] }
    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ack()),
      chunk: () => Promise.resolve(ack()),
      frames: (f, log) => { rec.frames.push(f); entries.push(...log); return Promise.resolve() },
      done: (d) => { rec.done.push(d); return Promise.resolve() },
      failed: (f) => { rec.failed.push(f); return Promise.resolve() },
    }
    const sim = createSimulation({
      runId: 'log',
      config: { ...defaultConfig('medium'), ticks: 1_200, cats: 3, ...over.config },
      seed: 5,
      coordinator,
      upload: () => Promise.resolve(),
      provider: () => baselineProvider(),
    })
    await sim.start()
    return entries
  }

  it('Records a mouse that starves, and what it was doing', async () => {
    const entries = await logFrom()
    const starved = entries.filter((e) => e.kind === 'starved')
    expect(starved.length).toBeGreaterThan(0)
    expect(starved[0]?.text).toMatch(/starved/i)
    expect(starved[0]?.subject).toMatch(/^m/)
  }, 30_000)

  it('Records a mouse a cat caught, naming the cat', async () => {
    const entries = await logFrom()
    const eaten = entries.filter((e) => e.kind === 'eaten')
    expect(eaten.length).toBeGreaterThan(0)
    expect(eaten[0]?.text).toMatch(/^m\d+ was caught by c\d+/)
  }, 30_000)

  it('Says who decided what the mouse was doing when it died', async () => {
    const entries = await logFrom()
    const withDecision = entries.filter((e) => e.decision !== undefined)
    expect(withDecision.length).toBeGreaterThan(0)
    for (const e of withDecision) {
      expect(e.decidedBy).toBe('baseline')
      expect(typeof e.decision).toBe('string')
    }
  }, 30_000)

  it('Records a litter and a pup that could not fit', async () => {
    const entries = await logFrom({
      config: { cats: 0, traps: 0, foodPiles: 60, foodRespawnTicks: 10,
                nutritionDecayPerTick: 0.3, mouseholes: 30, ticks: 2_000 },
    })
    const born = entries.filter((e) => e.kind === 'born')
    expect(born.length).toBeGreaterThan(0)
    expect(born[0]?.text).toMatch(/born/i)
  }, 40_000)

  it('Records a cat that starves with nothing to catch', async () => {
    const entries = await logFrom({
      config: { maleMice: 0, femaleMice: 0, cats: 2, traps: 0, foodPiles: 0, ticks: 2_000 },
    })
    const starved = entries.filter((e) => e.kind === 'cat_starved')
    expect(starved.length).toBe(2)
    expect(starved[0]?.text).toMatch(/starved/i)
  }, 30_000)

  it('Loses nothing that happened between two frames', async () => {
    // Frames go out every few ticks; a death on any other tick must still
    // appear, so the log is complete rather than sampled.
    const entries = await logFrom()
    const ticks = entries.map((e) => e.tick)
    expect(new Set(ticks).size).toBeGreaterThan(5)
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b))
  }, 30_000)

  it('Carries only what changes the population', async () => {
    const entries = await logFrom()
    const kinds = new Set(entries.map((e) => e.kind))
    for (const k of kinds) {
      expect(['starved', 'eaten', 'trapped', 'born', 'mated', 'cat_starved', 'birth_lost'])
        .toContain(k)
    }
  }, 30_000)
})

describe('What a run reports about its population', () => {
  it('Reports the highest and lowest mice and cats it has seen', async () => {
    const { sim, rec } = harness({ config: { ticks: 500 } })
    await sim.start()
    const last = rec.reports.at(-1)
    expect(last).toBeDefined()
    const p = last!.totals.population
    expect(p.mice.peak).toBeGreaterThanOrEqual(p.mice.current)
    expect(p.mice.min).toBeLessThanOrEqual(p.mice.current)
    expect(p.cats.peak).toBeGreaterThanOrEqual(p.cats.current)
    expect(p.cats.min).toBeLessThanOrEqual(p.cats.current)
  }, 20_000)

  it('Starts the peak at the population it began with', async () => {
    const config = { ...defaultConfig('small'), ticks: 300 }
    const { sim, rec } = harness({ config })
    await sim.start()
    const p = rec.reports[0]!.totals.population
    expect(p.mice.peak).toBeGreaterThanOrEqual(config.maleMice + config.femaleMice)
    expect(p.cats.peak).toBe(config.cats)
  }, 20_000)

  it('Carries the extremes forward rather than resetting them each chunk', async () => {
    const { sim, rec } = harness({ config: { ticks: 750 } })
    await sim.start()
    expect(rec.reports.length).toBeGreaterThan(1)
    for (let i = 1; i < rec.reports.length; i++) {
      const prev = rec.reports[i - 1]!.totals.population
      const now = rec.reports[i]!.totals.population
      expect(now.mice.peak).toBeGreaterThanOrEqual(prev.mice.peak)
      expect(now.mice.min).toBeLessThanOrEqual(prev.mice.min)
      expect(now.cats.peak).toBeGreaterThanOrEqual(prev.cats.peak)
      expect(now.cats.min).toBeLessThanOrEqual(prev.cats.min)
    }
  }, 20_000)

  it('Ends with what was actually left alive', async () => {
    const { sim, rec } = harness({ config: { ticks: 300 } })
    await sim.start()
    const done = rec.done[0]
    expect(done).toBeDefined()
    expect(done!.totals.population.mice.current).toBeGreaterThanOrEqual(0)
    expect(done!.totals.population.cats.current).toBeGreaterThanOrEqual(0)
  }, 20_000)
})

describe('A run that ends before its turns run out', () => {
  const barren = { maleMice: 2, femaleMice: 0, cats: 0, traps: 0, foodPiles: 0,
                   mouseholes: 0, nutritionDecayPerTick: 4 }

  it('Stops when nothing is left alive, rather than spinning to the limit', async () => {
    const { sim, rec } = harness({ config: { ...barren, ticks: 20_000 } })
    await sim.start()
    expect(rec.done).toHaveLength(1)
    expect(rec.done[0]?.finalTick).toBeLessThan(200)
    expect(sim.currentTick()).toBe(rec.done[0]?.finalTick)
  }, 30_000)

  it('Says it was extinction, not that the turns ran out', async () => {
    const { sim, rec } = harness({ config: { ...barren, ticks: 20_000 } })
    await sim.start()
    expect(rec.done[0]?.reason).toBe('extinct')
  }, 30_000)

  it('Says it completed when the turns really did run out', async () => {
    const { sim, rec } = harness({
      config: { ticks: 300, foodPiles: 20, foodRespawnTicks: 10,
                nutritionDecayPerTick: 0.2 },
    })
    await sim.start()
    expect(rec.done[0]?.reason).toBe('completed')
  }, 30_000)

  it('Sends a frame for the final turn, so the page ends where the run did', async () => {
    const seen: Frame[] = []
    const rec: { reason: string | null } = { reason: null }
    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ack({ control: { desired: 'run', speed: 334, seq: 0 } })),
      chunk: () => Promise.resolve(ack({ control: { desired: 'run', speed: 334, seq: 0 } })),
      frames: (f) => { seen.push(...f); return Promise.resolve() },
      done: (d) => { rec.reason = d.reason; return Promise.resolve() },
      failed: () => Promise.resolve(),
    }
    const sim = createSimulation({
      runId: 'end',
      config: { ...defaultConfig('small'), ...barren, ticks: 20_000 },
      seed: 5,
      coordinator,
      upload: () => Promise.resolve(),
      provider: () => baselineProvider(),
    })
    await sim.start()
    // The frame interval would otherwise leave the last frame short of the end,
    // so a finished run showed one turn and reported another.
    expect(rec.reason).toBe('extinct')
    expect(seen.at(-1)?.tick).toBe(sim.currentTick())
  }, 30_000)

  it('Stores the last turn rather than losing it', async () => {
    const { sim, rec } = harness({ config: { ...barren, ticks: 20_000 } })
    await sim.start()
    const final = rec.done[0]?.finalTick ?? 0
    const lastChunk = rec.reports.at(-1)
    expect(lastChunk?.lastTick).toBe(final)
  }, 30_000)
})

describe('Per-turn telemetry', () => {
  const summaries = (rec: Recorded): SummaryBody[] =>
    rec.puts.filter((p) => p.url === 'put:summary')
      .map((p) => JSON.parse(gunzipSync(p.body).toString('utf8')) as SummaryBody)

  it('Records one point for every turn, with nothing skipped', async () => {
    const { sim, rec } = harness({ config: { ticks: 500 } })
    await sim.start()
    const points = summaries(rec).flatMap((s) => s.points)
    expect(points).toHaveLength(500)
    expect(points.map((p) => p.tick)).toEqual(
      Array.from({ length: 500 }, (_, i) => i + 1))
  }, 30_000)

  it('Counts what was standing at the end of each turn', async () => {
    const config = { ...defaultConfig('small'), ticks: 300 }
    const { sim, rec } = harness({ config })
    await sim.start()
    const first = summaries(rec).flatMap((s) => s.points)[0]
    expect(first).toBeDefined()
    expect(first!.cats).toBeLessThanOrEqual(config.cats)
    expect(first!.food).toBeLessThanOrEqual(config.foodPiles)
    expect(first!.traps).toBeLessThanOrEqual(config.traps)
    expect(first!.population).toBeGreaterThan(0)
  }, 30_000)

  it('Stores the events of a turn in the chunk that covers it', async () => {
    const { sim, rec } = harness({ config: { ticks: 250 } })
    await sim.start()
    const chunk = rec.puts.filter((p) => p.url === 'put:chunk')
      .map((p) => JSON.parse(gunzipSync(p.body).toString('utf8')) as ChunkBody)[0]
    expect(chunk).toBeDefined()
    const ticks = new Set(chunk!.events.map((e) => e.tick))
    // Every turn in the chunk's range put something in it, if only its own
    // tick_advanced, so a turn is never missing from the record.
    for (let t = chunk!.firstTick; t <= chunk!.lastTick; t++) {
      expect(ticks.has(t), `turn ${String(t)} has no events at all`).toBe(true)
    }
  }, 30_000)

  it('Records the life-changing events a turn view needs, not just movement', async () => {
    const { sim, rec } = harness({ config: { ticks: 500 } })
    await sim.start()
    const kinds = new Set(rec.puts.filter((p) => p.url === 'put:chunk')
      .flatMap((p) => (JSON.parse(gunzipSync(p.body).toString('utf8')) as ChunkBody).events)
      .map((e) => e.kind))
    for (const wanted of ['spotted', 'hunger_changed', 'food_eaten', 'death', 'tick_advanced']) {
      expect(kinds, `no ${wanted} in the record`).toContain(wanted)
    }
  }, 30_000)
})

describe('What the process holds on to', () => {
  it('Does not let the engine keep every event of the run', async () => {
    // ISSUE-014. The engine buffers events until drained, and the process was
    // only ever slicing from a remembered index, so a long run retained
    // everything: measured at 335,880 events and 136MB after 3,000 ticks.
    let engine: Engine | null = null
    const { sim } = harness({
      config: { ticks: 1_500, foodPiles: 20, foodRespawnTicks: 10,
                nutritionDecayPerTick: 0.2 },
      capture: (e) => { engine = e },
    })
    await sim.start()
    expect(engine).not.toBeNull()
    const held = (engine as unknown as Engine).events().length
    // A chunk closes every 250 ticks, so nothing older than the open chunk
    // should still be sitting in the engine.
    expect(held, `the engine is still holding ${String(held)} events`)
      .toBeLessThan(CHUNK_TICKS * 200)
  }, 30_000)

  it('Still reports every event it consumed, having drained them', async () => {
    const { sim, rec } = harness({ config: { ticks: 500 } })
    await sim.start()
    const stored = rec.puts.filter((p) => p.url === 'put:chunk')
      .flatMap((p) => (JSON.parse(gunzipSync(p.body).toString('utf8')) as ChunkBody).events)
    // Draining must not lose anything: every turn still appears in the record.
    const ticks = new Set(stored.map((e) => e.tick))
    for (let t = 1; t <= 500; t++) {
      expect(ticks.has(t), `turn ${String(t)} vanished from the record`).toBe(true)
    }
  }, 30_000)
})

describe('Advancing a run in batches, as the Run Durable Object does', () => {
  const snapshotsOf = (rec: Recorded): Snapshot[] =>
    rec.puts.filter((p) => p.url === 'put:snapshot')
      .map((p) => JSON.parse(gunzipSync(p.body).toString('utf8')) as Snapshot)

  it('Stops at the ceiling it was given and does not call the run finished', async () => {
    const { sim, rec } = harness({ config: { ticks: 600 } })
    const out = await sim.start({ until: CHUNK_TICKS })
    expect(out).toEqual({ finished: false, tick: CHUNK_TICKS })
    // The important half: a batch boundary must not look like the end of a run,
    // or the coordinator would archive a run still only a third done.
    expect(rec.done).toHaveLength(0)
    expect(rec.failed).toHaveLength(0)
  })

  it('Leaves a snapshot to carry on from', async () => {
    const { sim, rec } = harness({ config: { ticks: 600 } })
    await sim.start({ until: CHUNK_TICKS })
    const snaps = snapshotsOf(rec)
    expect(snaps).toHaveLength(1)
    expect(snaps[0]!.tick).toBe(CHUNK_TICKS)
  })

  it('Says so when the last batch reaches the end', async () => {
    const { sim, rec } = harness({ config: { ticks: 300 } })
    const out = await sim.start({ until: 1000 })
    expect(out).toEqual({ finished: true, tick: 300 })
    expect(rec.done).toHaveLength(1)
  })

  it('Produces the same run in batches as in one pass', async () => {
    // This is what makes the Durable Object design safe at all. If a run
    // advanced in batches were not the same run, every survival figure and
    // every replay would be measured against something the deployment does not
    // actually do.
    const whole = harness({ config: { ticks: 600 } })
    await whole.sim.start()

    const parts = harness({ config: { ticks: 600 } })
    let snapshot: Snapshot | undefined
    for (let ceiling = CHUNK_TICKS; ; ceiling += CHUNK_TICKS) {
      const out = await parts.sim.start(snapshot ? { snapshot, until: ceiling } : { until: ceiling })
      if (out.finished) break
      snapshot = snapshotsOf(parts.rec).at(-1)!
    }

    const events = (rec: Recorded): unknown[] =>
      (chunkBodies(rec) as { events: unknown[] }[]).flatMap((b) => b.events)
    expect(events(parts.rec)).toEqual(events(whole.rec))
  })
})

describe('How often a viewer hears from a run that is slower than it asked for', () => {
  // The interval between frames was derived from the speed the run was asked
  // for, not the speed it achieved. Asking for 334 ticks a second set it to one
  // frame every seventeen ticks: fine at 334 ticks a second, but with Jev
  // deciding a run manages a few ticks a second, and seventeen ticks is five to
  // eight seconds of a frozen picture. Turning the speed up made the viewer
  // slower while the run went no faster.
  const SEVENTEEN = Math.round(334 / FRAMES_PER_SECOND)

  it('Draws on the tick interval when the run is keeping up', () => {
    expect(dueForFrame({ tick: SEVENTEEN, every: SEVENTEEN, stepped: false, msSinceLastFrame: 0 }))
      .toBe(true)
    expect(dueForFrame({ tick: SEVENTEEN + 1, every: SEVENTEEN, stepped: false, msSinceLastFrame: 0 }))
      .toBe(false)
  })

  it('Draws anyway once enough time has passed, however far off the interval is', () => {
    // This is the regression. One tick after a frame, nowhere near the
    // seventeen-tick interval, but a fifth of a second has gone by because the
    // decisions are slow. The old rule said no and the picture sat still.
    expect(dueForFrame({ tick: 1, every: SEVENTEEN, stepped: false, msSinceLastFrame: 200 }))
      .toBe(true)
  })

  it('Holds off when neither the interval nor the clock is due', () => {
    expect(dueForFrame({ tick: 3, every: SEVENTEEN, stepped: false, msSinceLastFrame: 5 }))
      .toBe(false)
  })

  it('Always draws a stepped turn', () => {
    expect(dueForFrame({ tick: 3, every: SEVENTEEN, stepped: true, msSinceLastFrame: 0 }))
      .toBe(true)
  })

  it('Cannot be starved by asking for a speed the run cannot reach', () => {
    // A run achieving three ticks a second, asked for 334. Every turn takes a
    // third of a second, so every turn is drawn, and the worst wait a watcher
    // sees is one turn rather than seventeen.
    const drawn = []
    for (let tick = 1; tick <= 20; tick++) {
      if (dueForFrame({ tick, every: SEVENTEEN, stepped: false, msSinceLastFrame: 333 })) {
        drawn.push(tick)
      }
    }
    expect(drawn).toHaveLength(20)
  })
})
