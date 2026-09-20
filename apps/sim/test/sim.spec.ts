import { describe, it, expect } from 'vitest'
import { gunzipSync } from 'node:zlib'
import {
  defaultConfig, baselineProvider, type RunConfig, type Snapshot,
} from '@jev-mice/engine'
import {
  createSimulation, CHUNK_TICKS,
  type ChunkAck, type ChunkReport, type Coordinator, type Frame,
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
  done: { finalTick: number; totals: ChunkReport['totals'] }[]
  failed: { atTick: number; reason: string }[]
}

function harness(over: {
  config?: Partial<RunConfig>
  ackFor?: (report: ChunkReport | null) => ChunkAck
  onReport?: (r: ChunkReport, rec: Recorded) => void
  onUpload?: (url: string) => void
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
    const first = rec.frames[0]?.[0]
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
