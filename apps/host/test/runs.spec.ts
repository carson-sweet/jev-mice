import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { defaultConfig } from '@jev-mice/engine'
import { SPEED } from '@jev-mice/sim'
import { createRunManager, type RunManager } from '../src/runs.js'

const dirs: string[] = []
function manager(over: Partial<Parameters<typeof createRunManager>[0]> = {}): RunManager {
  const root = mkdtempSync(join(tmpdir(), 'jev-mice-'))
  dirs.push(root)
  return createRunManager({ root, maxConcurrent: 2, apiKey: null, ...over })
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

const small = (over = {}) => ({ ...defaultConfig('small'), ticks: 300, ...over })
const settled = async (m: RunManager, id: string, ms = 20_000): Promise<void> => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const s = m.get(id)?.status
    if (s === 'completed' || s === 'failed' || s === 'cancelled') return
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error(`run ${id} never settled, last status ${String(m.get(id)?.status)}`)
}

describe('The run manager', () => {
  it('Runs a simulation to completion and records where it got to', async () => {
    const m = manager()
    const run = m.create({ config: small(), seed: 3 })
    await settled(m, run.id)
    const done = m.get(run.id)
    expect(done?.status).toBe('completed')
    expect(done?.currentTick).toBe(300)
    expect(done?.chunks.length).toBeGreaterThan(0)
  }, 30_000)

  it('Writes every chunk under the run it belongs to and nowhere else', async () => {
    const m = manager()
    const a = m.create({ config: small(), seed: 1 })
    await settled(m, a.id)
    const b = m.create({ config: small(), seed: 2 })
    await settled(m, b.id)
    for (const id of [a.id, b.id]) {
      const files = readdirSync(join(m.root, 'runs', id, 'chunks'))
      expect(files.length).toBeGreaterThan(0)
      for (const f of files) {
        const body = JSON.parse(
          gunzipSync(readFileSync(join(m.root, 'runs', id, 'chunks', f))).toString('utf8')) as
          { runId: string }
        expect(body.runId).toBe(id)
      }
    }
  }, 40_000)

  it('Refuses to start more runs at once than it has room for', () => {
    const m = manager({ maxConcurrent: 1 })
    m.create({ config: small({ ticks: 20_000 }), seed: 1 })
    const queued = m.create({ config: small(), seed: 2 })
    expect(queued.status).toBe('queued')
    expect(m.get(queued.id)?.queuePosition).toBe(1)
  })

  it('Starts a queued run when the one ahead of it finishes', async () => {
    const m = manager({ maxConcurrent: 1 })
    const first = m.create({ config: small({ ticks: 260 }), seed: 1 })
    const second = m.create({ config: small({ ticks: 260 }), seed: 2 })
    expect(second.status).toBe('queued')
    await settled(m, first.id)
    await settled(m, second.id)
    expect(m.get(second.id)?.status).toBe('completed')
  }, 60_000)

  it('Rejects a configuration the engine will not accept', () => {
    const m = manager()
    expect(() => m.create({ config: small({ maleMice: -4 }), seed: 1 }))
      .toThrow(/maleMice/)
  })

  it('Stops a run when told to, leaving what it already produced', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1 })
    await new Promise((r) => setTimeout(r, 300))
    m.control(run.id, 'stop')
    await settled(m, run.id)
    const state = m.get(run.id)
    expect(state?.status).toBe('completed')
    expect(state?.currentTick).toBeGreaterThan(0)
    expect(state?.currentTick).toBeLessThan(20_000)
  }, 30_000)

  it('Holds a paused run where it is and lets it go again', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1 })
    await new Promise((r) => setTimeout(r, 200))
    m.control(run.id, 'pause')
    await new Promise((r) => setTimeout(r, 150))
    const held = m.get(run.id)?.currentTick ?? 0
    await new Promise((r) => setTimeout(r, 200))
    expect(m.get(run.id)?.currentTick).toBe(held)
    m.control(run.id, 'resume')
    await new Promise((r) => setTimeout(r, 250))
    expect(m.get(run.id)?.currentTick ?? 0).toBeGreaterThan(held)
    m.control(run.id, 'stop')
    await settled(m, run.id)
  }, 30_000)

  it('Gives a watcher the frames it missed and then the live ones', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1 })
    await new Promise((r) => setTimeout(r, 250))
    const seen: number[] = []
    const stop = m.watch(run.id, (msg) => {
      if (msg.t === 'frame') seen.push(msg.frame.tick)
    })
    const opening = m.snapshotOf(run.id)
    expect(opening?.tick).toBeGreaterThan(0)
    await new Promise((r) => setTimeout(r, 250))
    stop()
    m.control(run.id, 'stop')
    await settled(m, run.id)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
  }, 30_000)

  it('Runs on the fixed rules when there is no key to call the service with', async () => {
    const m = manager({ apiKey: null })
    const run = m.create({ config: small({ ticks: 260 }), seed: 1 })
    await settled(m, run.id)
    expect(m.get(run.id)?.totals.requests).toBe(0)
    expect(m.get(run.id)?.totals.fallbackCount).toBeGreaterThan(0)
  }, 30_000)

  it('Lists runs newest first with what a library screen needs', async () => {
    const m = manager()
    const a = m.create({ config: small({ ticks: 260 }), seed: 1 })
    await settled(m, a.id)
    const b = m.create({ config: small({ ticks: 260 }), seed: 2 })
    await settled(m, b.id)
    const list = m.list()
    expect(list.map((r) => r.id)).toEqual([b.id, a.id])
    expect(list[0]).toMatchObject({ status: 'completed', seed: 2 })
    expect(typeof list[0]?.createdAt).toBe('string')
  }, 40_000)
})

describe('Choosing who decides', () => {
  it('Runs on the rules when the rules are asked for, even with a key present', async () => {
    const m = manager({ apiKey: 'not-used-because-rules-were-asked-for' })
    const run = m.create({ config: small({ ticks: 260 }), seed: 1, decider: 'rules' })
    expect(run.decidedBy).toBe('rules')
    await settled(m, run.id)
    expect(m.get(run.id)?.totals.requests).toBe(0)
  }, 30_000)

  it('Refuses Jev when there is no key to call it with', () => {
    const m = manager({ apiKey: null })
    expect(() => m.create({ config: small(), seed: 1, decider: 'jev' }))
      .toThrow(/no decision key/i)
  })

  it('Defaults to the rules when nothing is said and no key is set', () => {
    const m = manager({ apiKey: null })
    expect(m.create({ config: small(), seed: 1 }).decidedBy).toBe('rules')
  })

  it('Says whether Jev is available at all', () => {
    expect(manager({ apiKey: null }).jevAvailable).toBe(false)
    expect(manager({ apiKey: 'present' }).jevAvailable).toBe(true)
  })
})

describe('Setting the pace', () => {
  it('Starts at the speed it was given and reports it', () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: 25 })
    expect(run.speed).toBe(25)
    m.control(run.id, 'stop')
  })

  it('Changes the pace of a running simulation', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: 2 })
    await new Promise((r) => setTimeout(r, 300))
    const crawling = m.get(run.id)?.currentTick ?? 0
    expect(m.setSpeed(run.id, 300)).toBe(true)
    expect(m.get(run.id)?.speed).toBe(300)
    await new Promise((r) => setTimeout(r, 400))
    expect(m.get(run.id)?.currentTick ?? 0).toBeGreaterThan(crawling)
    m.control(run.id, 'stop')
    await settled(m, run.id)
  }, 30_000)

  it('Keeps a speed inside the range a slider can ask for', () => {
    const m = manager()
    const tooSlow = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: 0 })
    expect(tooSlow.speed).toBe(SPEED.slowest)
    m.control(tooSlow.id, 'stop')
    const tooFast = m.create({ config: small({ ticks: 20_000 }), seed: 2, speed: 99_999 })
    expect(tooFast.speed).toBe(SPEED.fastest)
    m.control(tooFast.id, 'stop')
  })
})

describe('What the library needs about a finished run', () => {
  it('Records the highest, lowest and final mice and cats', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 400 }), seed: 3 })
    await settled(m, run.id)
    const done = m.get(run.id)
    expect(done?.population.mice.peak).toBeGreaterThan(0)
    expect(done?.population.mice.min).toBeLessThanOrEqual(done!.population.mice.peak)
    expect(done?.population.cats.peak).toBeGreaterThanOrEqual(done!.population.cats.current)
    expect(done?.population.cats.min).toBeLessThanOrEqual(done!.population.cats.peak)
  }, 30_000)

  it('Keeps the settings the run was started with, so a table can show them', async () => {
    const config = small({ ticks: 300, cats: 2, traps: 3 })
    const m = manager()
    const run = m.create({ config, seed: 9 })
    await settled(m, run.id)
    expect(m.get(run.id)?.config).toEqual(config)
    expect(m.get(run.id)?.seed).toBe(9)
  }, 30_000)
})
