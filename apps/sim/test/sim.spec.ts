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
  done: { finalTick: number }[]
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
