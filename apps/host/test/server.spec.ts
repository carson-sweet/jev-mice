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
      config: { ...defaultConfig('small'), ticks: 300 }, seed: 5,
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
      config: { ...defaultConfig('small'), ticks: 20_000 }, seed: 6,
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
      config: { ...defaultConfig('small'), ticks: 300 }, seed: 7,
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
      config: { ...defaultConfig('small'), ticks: 300 }, seed: 21,
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
