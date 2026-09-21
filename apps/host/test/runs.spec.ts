import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { defaultConfig } from '@jev-mice/engine'
import { SPEED, SPEED_CEILING } from '@jev-mice/sim'
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
    const run = m.create({ config: small(), seed: 3, speed: SPEED.fastest })
    await settled(m, run.id)
    const done = m.get(run.id)
    expect(done?.status).toBe('completed')
    expect(done?.currentTick).toBe(300)
    expect(done?.chunks.length).toBeGreaterThan(0)
  }, 30_000)

  it('Writes every chunk under the run it belongs to and nowhere else', async () => {
    const m = manager()
    const a = m.create({ config: small(), seed: 1, speed: SPEED.fastest })
    await settled(m, a.id)
    const b = m.create({ config: small(), seed: 2, speed: SPEED.fastest })
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
    m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest })
    const queued = m.create({ config: small(), seed: 2, speed: SPEED.fastest })
    expect(queued.status).toBe('queued')
    expect(m.get(queued.id)?.queuePosition).toBe(1)
  })

  it('Starts a queued run when the one ahead of it finishes', async () => {
    const m = manager({ maxConcurrent: 1 })
    const first = m.create({ config: small({ ticks: 260 }), seed: 1, speed: SPEED.fastest })
    const second = m.create({ config: small({ ticks: 260 }), seed: 2, speed: SPEED.fastest })
    expect(second.status).toBe('queued')
    await settled(m, first.id)
    await settled(m, second.id)
    expect(m.get(second.id)?.status).toBe('completed')
  }, 60_000)

  it('Rejects a configuration the engine will not accept', () => {
    const m = manager()
    expect(() => m.create({ config: small({ maleMice: -4 }), seed: 1, speed: SPEED.fastest }))
      .toThrow(/maleMice/)
  })

  it('Stops a run when told to, leaving what it already produced', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest })
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
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest })
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
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest })
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
    const run = m.create({ config: small({ ticks: 260 }), seed: 1, speed: SPEED.fastest })
    await settled(m, run.id)
    expect(m.get(run.id)?.totals.requests).toBe(0)
    expect(m.get(run.id)?.totals.fallbackCount).toBeGreaterThan(0)
  }, 30_000)

  it('Lists runs newest first with what a library screen needs', async () => {
    const m = manager()
    const a = m.create({ config: small({ ticks: 260 }), seed: 1, speed: SPEED.fastest })
    await settled(m, a.id)
    const b = m.create({ config: small({ ticks: 260 }), seed: 2, speed: SPEED.fastest })
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
    const run = m.create({ config: small({ ticks: 260 }), seed: 1, decider: 'rules', speed: SPEED.fastest })
    expect(run.decidedBy).toBe('rules')
    await settled(m, run.id)
    expect(m.get(run.id)?.totals.requests).toBe(0)
  }, 30_000)

  it('Refuses Jev when there is no key to call it with', () => {
    const m = manager({ apiKey: null })
    expect(() => m.create({ config: small(), seed: 1, decider: 'jev', speed: SPEED.fastest }))
      .toThrow(/no decision key/i)
  })

  it('Defaults to the rules when nothing is said and no key is set', () => {
    const m = manager({ apiKey: null })
    expect(m.create({ config: small(), seed: 1, speed: SPEED.fastest }).decidedBy).toBe('rules')
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
    // 300 is past the rules' ceiling of 50, so it lands on the ceiling rather
    // than being stored as a number the run could not honour.
    expect(m.setSpeed(run.id, 300)).toBe(true)
    expect(m.get(run.id)?.speed).toBe(SPEED_CEILING.rules)
    await new Promise((r) => setTimeout(r, 400))
    expect(m.get(run.id)?.currentTick ?? 0).toBeGreaterThan(crawling)
    m.control(run.id, 'stop')
    await settled(m, run.id)
  }, 30_000)

  it('Keeps a speed inside the range a slider can ask for', () => {
    // The ceiling is the decider's, not the engine's. These runs are decided by
    // the rules, so the top is 50 rather than 334.
    const m = manager()
    const tooSlow = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: 0 })
    expect(tooSlow.speed).toBe(SPEED.slowest)
    m.control(tooSlow.id, 'stop')
    const tooFast = m.create({ config: small({ ticks: 20_000 }), seed: 2, speed: 99_999 })
    expect(tooFast.speed).toBe(SPEED_CEILING.rules)
    m.control(tooFast.id, 'stop')
  })
})

describe('What the library needs about a finished run', () => {
  it('Records the highest, lowest and final mice and cats', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 400 }), seed: 3, speed: SPEED.fastest })
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
    const run = m.create({ config, seed: 9, speed: SPEED.fastest })
    await settled(m, run.id)
    expect(m.get(run.id)?.config).toEqual(config)
    expect(m.get(run.id)?.seed).toBe(9)
  }, 30_000)
})

describe('The running log reaching a watcher', () => {
  it('Sends population changes as they happen', async () => {
    const m = manager()
    const run = m.create({
      config: small({ ticks: 20_000, cats: 2 }), seed: 4, speed: 300,
    })
    const lines: { kind: string; text: string; tick: number }[] = []
    const stop = m.watch(run.id, (msg) => {
      if (msg.t === 'log') lines.push(...msg.entries)
    })
    await new Promise((r) => setTimeout(r, 2_500))
    stop()
    m.control(run.id, 'stop')
    await settled(m, run.id)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => l.text.length > 0)).toBe(true)
    expect(lines.map((l) => l.tick)).toEqual([...lines.map((l) => l.tick)].sort((a, b) => a - b))
  }, 30_000)

  it('Gives a viewer joining late the recent lines, not an empty panel', async () => {
    const m = manager()
    const run = m.create({
      config: small({ ticks: 20_000, cats: 2 }), seed: 4, speed: 300,
    })
    await new Promise((r) => setTimeout(r, 1_500))
    let opening: { entries: unknown[] } | null = null
    const stop = m.watch(run.id, (msg) => {
      if (msg.t === 'hello') opening = { entries: msg.log }
    })
    stop()
    m.control(run.id, 'stop')
    await settled(m, run.id)
    expect(opening).not.toBeNull()
    expect((opening as unknown as { entries: unknown[] }).entries.length).toBeGreaterThan(0)
  }, 30_000)
})

describe('How fast a run starts', () => {
  it('Starts slow, so the first thing anyone sees is watchable', () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1 })
    expect(run.speed).toBe(SPEED.slowest)
    m.control(run.id, 'stop')
  })

  it('Still honours a speed that was asked for', () => {
    const m = manager()
    // Inside the rules' ceiling of 50, so it is kept exactly as asked.
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 2, speed: 40 })
    expect(run.speed).toBe(40)
    m.control(run.id, 'stop')
  })
})

describe('Stepping a run', () => {
  it('Leaves the run paused and says so, rather than reporting it as running', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest })
    await new Promise((r) => setTimeout(r, 200))
    m.control(run.id, 'step')
    await new Promise((r) => setTimeout(r, 200))
    // A step is one turn out of a pause. Saying "running" while nothing
    // advances leaves the page showing a control that does nothing.
    expect(m.get(run.id)?.status).toBe('paused')
    const held = m.get(run.id)?.currentTick ?? 0
    await new Promise((r) => setTimeout(r, 300))
    expect(m.get(run.id)?.currentTick).toBe(held)
    m.control(run.id, 'stop')
    await settled(m, run.id)
  }, 30_000)

  it('Advances, then holds, so a resume is what starts it again', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest })
    await new Promise((r) => setTimeout(r, 200))
    m.control(run.id, 'pause')
    await new Promise((r) => setTimeout(r, 150))
    const before = m.get(run.id)?.currentTick ?? 0
    m.control(run.id, 'step')
    await new Promise((r) => setTimeout(r, 200))
    expect(m.get(run.id)?.currentTick).toBe(before + 1)
    m.control(run.id, 'resume')
    await new Promise((r) => setTimeout(r, 250))
    expect(m.get(run.id)?.currentTick ?? 0).toBeGreaterThan(before + 1)
    m.control(run.id, 'stop')
    await settled(m, run.id)
  }, 30_000)
})

describe('A run that ends in extinction', () => {
  const barren = () => small({
    maleMice: 2, femaleMice: 0, cats: 0, traps: 0, foodPiles: 0, mouseholes: 0,
    nutritionDecayPerTick: 4, ticks: 20_000,
  })

  it('Says extinction, so the page can say so too', async () => {
    const m = manager()
    const run = m.create({ config: barren(), seed: 1, speed: SPEED.fastest })
    await settled(m, run.id)
    expect(m.get(run.id)?.status).toBe('completed')
    expect(m.get(run.id)?.endReason).toBe('extinct')
  }, 30_000)

  it('Ends with nothing alive on either side', async () => {
    const m = manager()
    const run = m.create({ config: barren(), seed: 1, speed: SPEED.fastest })
    await settled(m, run.id)
    const p = m.get(run.id)?.population
    expect(p?.mice.current).toBe(0)
    expect(p?.cats.current).toBe(0)
  }, 30_000)

  it('Says completed when the turns ran out with something still alive', async () => {
    const m = manager()
    const run = m.create({
      config: small({ ticks: 300, foodPiles: 20, foodRespawnTicks: 10,
                      nutritionDecayPerTick: 0.2 }),
      seed: 1,
      speed: SPEED.fastest,
    })
    await settled(m, run.id)
    expect(m.get(run.id)?.endReason).toBe('completed')
    expect(m.get(run.id)?.population.mice.current).toBeGreaterThan(0)
  }, 30_000)

  it('Says stopped when someone ended it', async () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest })
    await new Promise((r) => setTimeout(r, 250))
    m.control(run.id, 'stop')
    await settled(m, run.id)
    expect(m.get(run.id)?.endReason).toBe('stopped')
  }, 30_000)

  it('Has no end reason while it is still going', () => {
    const m = manager()
    const run = m.create({ config: small({ ticks: 20_000 }), seed: 1, speed: 1 })
    expect(run.endReason).toBeNull()
    m.control(run.id, 'stop')
  })
})

describe('What the coordinator tells a run to do', () => {
  it('Does not undo a stop at the next chunk boundary', async () => {
    // The acknowledgement used to re-derive the desired state from the run's
    // status, which knows about paused and not about stopped, so a chunk
    // landing just after a stop told the run to carry on.
    const m = manager()
    const run = m.create({
      config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest,
    })
    await new Promise((r) => setTimeout(r, 400))
    m.control(run.id, 'stop')
    await settled(m, run.id)
    const at = m.get(run.id)?.currentTick ?? 0
    expect(m.get(run.id)?.endReason).toBe('stopped')
    await new Promise((r) => setTimeout(r, 300))
    expect(m.get(run.id)?.currentTick).toBe(at)
  }, 30_000)

  it('Does not undo a step at the next chunk boundary', async () => {
    const m = manager()
    const run = m.create({
      config: small({ ticks: 20_000 }), seed: 1, speed: SPEED.fastest,
    })
    await new Promise((r) => setTimeout(r, 400))
    m.control(run.id, 'step')
    await new Promise((r) => setTimeout(r, 500))
    const held = m.get(run.id)?.currentTick ?? 0
    await new Promise((r) => setTimeout(r, 400))
    expect(m.get(run.id)?.currentTick).toBe(held)
    expect(m.get(run.id)?.status).toBe('paused')
    m.control(run.id, 'stop')
    await settled(m, run.id)
  }, 30_000)
})

describe('Making room for a new run', () => {
  const small20k = () => small({ ticks: 20_000 })

  it('Drops the oldest finished run rather than refusing a new one', async () => {
    const m = manager({ maxRuns: 3 })
    const ids: string[] = []
    for (const seed of [1, 2, 3]) {
      const run = m.create({ config: small({ ticks: 260 }), seed, speed: SPEED.fastest })
      ids.push(run.id)
      await settled(m, run.id)
    }
    expect(m.list()).toHaveLength(3)

    const fourth = m.create({ config: small({ ticks: 260 }), seed: 4, speed: SPEED.fastest })
    await settled(m, fourth.id)
    expect(m.list()).toHaveLength(3)
    // The first one made is the one that went.
    expect(m.get(ids[0] as string)).toBeNull()
    expect(m.get(ids[1] as string)).not.toBeNull()
    expect(m.get(fourth.id)).not.toBeNull()
  }, 60_000)

  it('Deletes what the evicted run left on disk', async () => {
    const m = manager({ maxRuns: 1 })
    const first = m.create({ config: small({ ticks: 260 }), seed: 1, speed: SPEED.fastest })
    await settled(m, first.id)
    const gone = join(m.root, 'runs', first.id)
    expect(existsSync(gone)).toBe(true)

    const second = m.create({ config: small({ ticks: 260 }), seed: 2, speed: SPEED.fastest })
    await settled(m, second.id)
    expect(existsSync(gone), 'the evicted run left its files behind').toBe(false)
    expect(existsSync(join(m.root, 'runs', second.id))).toBe(true)
  }, 60_000)

  it('Never evicts a run that is still going', async () => {
    const m = manager({ maxRuns: 2, maxConcurrent: 2 })
    const running = m.create({ config: small20k(), seed: 1, speed: 1 })
    const finished = m.create({ config: small({ ticks: 260 }), seed: 2, speed: SPEED.fastest })
    await settled(m, finished.id)

    const third = m.create({ config: small({ ticks: 260 }), seed: 3, speed: SPEED.fastest })
    await settled(m, third.id)
    // The finished one went, not the one still advancing.
    expect(m.get(running.id), 'a running run was evicted').not.toBeNull()
    expect(m.get(finished.id)).toBeNull()
    m.control(running.id, 'stop')
    await settled(m, running.id)
  }, 60_000)

  it('Never evicts a queued run waiting its turn', () => {
    // A window full of live runs refuses rather than losing work. Waiting to
    // start is still work.
    const m = manager({ maxRuns: 2, maxConcurrent: 1 })
    const first = m.create({ config: small20k(), seed: 1, speed: 1 })
    const queued = m.create({ config: small20k(), seed: 2, speed: 1 })
    expect(m.get(queued.id)?.status).toBe('queued')
    expect(() => m.create({ config: small20k(), seed: 3, speed: 1 }))
      .toThrow(/still going/i)
    expect(m.get(queued.id), 'a queued run was evicted').not.toBeNull()
    m.control(first.id, 'stop')
  })

  it('Refuses only when everything held is still going', async () => {
    const m = manager({ maxRuns: 2, maxConcurrent: 2 })
    m.create({ config: small20k(), seed: 1, speed: 1 })
    m.create({ config: small20k(), seed: 2, speed: 1 })
    expect(() => m.create({ config: small20k(), seed: 3, speed: 1 }))
      .toThrow(/still going|at once/i)
  })

  it(`Forgets an evicted run's cached telemetry`, async () => {
    const m = manager({ maxRuns: 1 })
    const first = m.create({ config: small({ ticks: 260 }), seed: 1, speed: SPEED.fastest })
    await settled(m, first.id)
    const second = m.create({ config: small({ ticks: 260 }), seed: 2, speed: SPEED.fastest })
    await settled(m, second.id)
    expect(m.chunkPath(first.id, 0), 'a path was offered for a deleted run').toBeNull()
  }, 60_000)
})
