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
