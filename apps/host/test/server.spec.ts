import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'
import { defaultConfig } from '@jev-mice/engine'
import { createHost } from '../src/server.js'

const root = mkdtempSync(join(tmpdir(), 'jev-mice-host-'))
const host = createHost({
  port: 0, root, webRoot: join(root, 'web'), maxConcurrent: 2, apiKey: null,
})
const started = await host.listen()
const base = `http://127.0.0.1:${String(started.port)}`
afterAll(async () => { await started.close(); rmSync(root, { recursive: true, force: true }) })

const post = async (path: string, body: unknown): Promise<{ status: number; body: any }> => {
  const r = await fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json() }
}

describe('The local host', () => {
  it('Offers a default configuration a run can be started from', async () => {
    const r = await fetch(`${base}/api/config/defaults?preset=small`)
    expect(r.status).toBe(200)
    const body = await r.json() as { config: { preset: string } }
    expect(body.config.preset).toBe('small')
  })

  it('Refuses a configuration the engine will not accept, and says which field', async () => {
    const bad = { ...defaultConfig('small'), cats: 9_999 }
    const r = await post('/api/runs', { config: bad, seed: 1 })
    expect(r.status).toBe(400)
    expect(r.body.errors.map((e: { field: string }) => e.field)).toContain('cats')
  })

  it('Starts a run and then reports it', async () => {
    const created = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 300 }, seed: 5, speed: 334,
    })
    expect(created.status).toBe(201)
    const id = created.body.run.id as string
    const got = await fetch(`${base}/api/runs/${id}`)
    expect(got.status).toBe(200)
    expect(((await got.json()) as any).run.seed).toBe(5)
  })

  it('Answers for a run that does not exist rather than failing', async () => {
    const r = await fetch(`${base}/api/runs/not-a-run`)
    expect(r.status).toBe(404)
  })

  it('Streams frames to a watching socket and takes control from it', async () => {
    const created = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 20_000 }, seed: 6, speed: 334,
    })
    const id = created.body.run.id as string
    const ws = new WebSocket(`ws://127.0.0.1:${String(started.port)}/api/runs/${id}/stream`)
    const frames: number[] = []
    let hello = false
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as { t: string; frame?: { tick: number } }
      if (m.t === 'hello') hello = true
      if (m.t === 'frame' && m.frame) frames.push(m.frame.tick)
    })
    await new Promise((r) => { ws.on('open', r) })
    await new Promise((r) => setTimeout(r, 400))
    expect(hello).toBe(true)
    expect(frames.length).toBeGreaterThan(0)

    ws.send(JSON.stringify({ t: 'control', action: 'stop' }))
    await new Promise((r) => setTimeout(r, 400))
    ws.close()
    const after = await (await fetch(`${base}/api/runs/${id}`)).json() as any
    expect(['completed', 'running']).toContain(after.run.status)
  }, 30_000)

  it('Serves a stored chunk as gzip once a run has produced one', async () => {
    const created = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 300 }, seed: 7, speed: 334,
    })
    const id = created.body.run.id as string
    for (let i = 0; i < 200; i++) {
      const s = await (await fetch(`${base}/api/runs/${id}`)).json() as any
      if (s.run.status === 'completed') break
      await new Promise((r) => setTimeout(r, 50))
    }
    const chunk = await fetch(`${base}/api/runs/${id}/chunks/0`)
    expect(chunk.status).toBe(200)
    expect(chunk.headers.get('content-type')).toBe('application/gzip')
  }, 30_000)

  it('Will not serve a file from outside the web root', async () => {
    const r = await fetch(`${base}/../../package.json`, { redirect: 'manual' })
    expect(r.status).not.toBe(200)
  })

  it('Never puts the decision key in anything it serves', async () => {
    const paths = ['/api/runs', '/api/config/defaults?preset=small']
    for (const p of paths) {
      const text = await (await fetch(base + p)).text()
      expect(text.toLowerCase()).not.toContain('apikey')
      expect(text.toLowerCase()).not.toContain('typesafe_api_key')
    }
  })
})

describe('What the host tells the page it can offer', () => {
  it('Says whether Jev is available, without revealing anything about the key', async () => {
    const r = await fetch(`${base}/api/capabilities`)
    expect(r.status).toBe(200)
    const text = await r.text()
    expect(JSON.parse(text)).toMatchObject({
      jevAvailable: false,
      speed: { slowest: 1, fastest: 334 },
    })
    expect(text.toLowerCase()).not.toContain('key')
  })

  it('Refuses a run on Jev when no key is configured, and explains why', async () => {
    const r = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 300 }, seed: 1, decider: 'jev',
    })
    expect(r.status).toBe(400)
    expect(String(r.body.error)).toMatch(/no decision key/i)
  })

  it('Refuses a decider it does not recognise', async () => {
    const r = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 300 }, seed: 1, decider: 'vibes',
    })
    expect(r.status).toBe(400)
  })

  it('Takes a speed when a run is created and reports it back', async () => {
    const r = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 20_000 }, seed: 11, speed: 12,
    })
    expect(r.status).toBe(201)
    expect(r.body.run.speed).toBe(12)
    await post(`/api/runs/${r.body.run.id as string}/control`, { action: 'stop' })
  })

  it('Changes the speed of a run already going', async () => {
    const created = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 20_000 }, seed: 12, speed: 3,
    })
    const id = created.body.run.id as string
    const changed = await post(`/api/runs/${id}/control`, { action: 'speed', speed: 120 })
    expect(changed.status).toBe(200)
    expect(changed.body.run.speed).toBe(120)
    await post(`/api/runs/${id}/control`, { action: 'stop' })
  })

  it('Refuses a speed change with no speed in it', async () => {
    const created = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 20_000 }, seed: 13,
    })
    const id = created.body.run.id as string
    const r = await post(`/api/runs/${id}/control`, { action: 'speed' })
    expect(r.status).toBe(400)
    await post(`/api/runs/${id}/control`, { action: 'stop' })
  })

  it('Lists what a table of previous runs needs', async () => {
    const created = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 300 }, seed: 21, speed: 334,
    })
    const id = created.body.run.id as string
    for (let i = 0; i < 200; i++) {
      const s = await (await fetch(`${base}/api/runs/${id}`)).json() as any
      if (s.run.status === 'completed') break
      await new Promise((r) => setTimeout(r, 50))
    }
    const listed = await (await fetch(`${base}/api/runs`)).json() as any
    const row = listed.runs.find((r: any) => r.seed === 21)
    expect(row).toBeDefined()
    expect(typeof row.createdAt).toBe('string')
    expect(row.config.preset).toBe('small')
    expect(row.population.mice.peak).toBeGreaterThan(0)
    expect(row.population.cats).toMatchObject({
      peak: expect.any(Number), min: expect.any(Number), current: expect.any(Number),
    })
    expect(row.decidedBy).toBe('rules')
  }, 30_000)
})

describe('Per-turn telemetry for a finished run', () => {
  const finished = async (over: Record<string, unknown> = {}): Promise<string> => {
    const created = await post('/api/runs', {
      config: { ...defaultConfig('small'), ticks: 300, ...over }, seed: 31, speed: 334,
    })
    const id = created.body.run.id as string
    for (let i = 0; i < 400; i++) {
      const s = await (await fetch(`${base}/api/runs/${id}`)).json() as any
      if (s.run.status === 'completed') return id
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error('run never finished')
  }

  it('Gives a window of turns, each with its own counts', async () => {
    const id = await finished()
    const r = await fetch(`${base}/api/runs/${id}/turns?from=1&to=20`)
    expect(r.status).toBe(200)
    const body = await r.json() as any
    expect(body.turns).toHaveLength(20)
    expect(body.turns[0].tick).toBe(1)
    expect(body.turns[19].tick).toBe(20)
    for (const turn of body.turns) {
      expect(turn.stats).toMatchObject({
        mice: expect.any(Number), cats: expect.any(Number),
        food: expect.any(Number), traps: expect.any(Number),
      })
    }
  }, 60_000)

  it('Gives the change from the turn before, so a reader sees movement', async () => {
    const id = await finished()
    const body = await (await fetch(`${base}/api/runs/${id}/turns?from=2&to=30`)).json() as any
    for (const turn of body.turns) {
      expect(turn.delta).toMatchObject({
        mice: expect.any(Number), cats: expect.any(Number),
        food: expect.any(Number), traps: expect.any(Number),
      })
    }
    // The first turn asked for still has a delta, taken against turn one.
    expect(body.turns[0].tick).toBe(2)
    expect(typeof body.turns[0].delta.mice).toBe('number')
  }, 60_000)

  it('Gives every life-changing event of a turn, and no plain movement', async () => {
    const id = await finished()
    const body = await (await fetch(`${base}/api/runs/${id}/turns?from=1&to=250`)).json() as any
    const all = body.turns.flatMap((t: any) => t.events)
    expect(all.length).toBeGreaterThan(0)
    expect(all.some((e: any) => e.kind === 'moved')).toBe(false)
    const kinds = new Set(all.map((e: any) => e.kind))
    expect([...kinds].length).toBeGreaterThan(3)
    for (const e of all) expect(typeof e.text).toBe('string')
  }, 60_000)

  it('Says how many turns there are, so a reader can page through them', async () => {
    const id = await finished()
    const body = await (await fetch(`${base}/api/runs/${id}/turns?from=1&to=5`)).json() as any
    expect(body.totalTurns).toBe(300)
    expect(body.from).toBe(1)
    expect(body.to).toBe(5)
  }, 60_000)

  it('Refuses a window too large to answer in one go', async () => {
    const id = await finished()
    const r = await fetch(`${base}/api/runs/${id}/turns?from=1&to=99999`)
    expect(r.status).toBe(400)
  }, 60_000)

  it('Answers for a run that does not exist rather than failing', async () => {
    const r = await fetch(`${base}/api/runs/nope/turns?from=1&to=5`)
    expect(r.status).toBe(404)
  })
})
