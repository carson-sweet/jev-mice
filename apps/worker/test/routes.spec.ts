// The Worker's routes, exercised the way the page actually calls them.
//
// This file exists because it was missing. Every other worker test checks a
// pure module; nothing checked that a route reaches the Run object, and a real
// bug lived in that gap for the life of the deployment: the page sends a speed
// change as POST /control with action "speed", the local host handles it there,
// and the Worker forwarded it to a Durable Object that understood only pause,
// resume, step and stop. The speed control did nothing on production, and
// creating a run with a speed -- which is what I had been testing -- worked
// fine, so nothing showed it.
//
// The rule these tests encode: a route is only correct if it carries what the
// page sends, in the shape the page sends it.

import { describe, it, expect, vi } from 'vitest'
import app from '../src/index.js'

/** Records every call the routes make into a Durable Object. */
function stubEnv() {
  const calls: { object: string; path: string; body: unknown }[] = []
  const stub = (object: string) => ({
    fetch: vi.fn(async (input: Request | string, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url
      let body: unknown = null
      const raw = typeof input === 'string' ? init?.body : await input.text().catch(() => null)
      if (typeof raw === 'string' && raw.length > 0) {
        try { body = JSON.parse(raw) } catch { body = raw }
      }
      calls.push({ object, path: new URL(url).pathname, body })
      return Response.json({ ok: true })
    }),
  })
  const namespace = (object: string) => ({
    idFromName: (name: string) => name,
    get: () => stub(object),
  })
  return {
    calls,
    env: {
      RUN: namespace('run'),
      BUDGET: namespace('budget'),
      REGISTRY: namespace('registry'),
      RECORDS: { get: vi.fn(async () => null), put: vi.fn(async () => undefined) },
      ASSETS: { fetch: vi.fn(async () => new Response('page', {
        headers: { 'content-type': 'text/html' } })) },
      TYPESAFE_API_KEY: 'k',
      MAX_TICKS: '10000',
    } as never,
  }
}

const post = (path: string, body: unknown, env: never) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, env)

describe('Changing the speed of a run', () => {
  it('Carries a speed change through to the run object', async () => {
    // The shape the page sends, which is what this has to accept.
    const { calls, env } = stubEnv()
    const res = await post('/api/runs/abc/control', { action: 'speed', speed: 40 }, env)
    expect(res.status).toBe(200)
    // It has to reach /speed, which is the route the run object implements.
    // Forwarding it to /control is what the bug was: the word "speed" was in
    // the body, so a looser assertion than this one passed while the object
    // silently dropped it.
    const reached = calls.filter((c) => c.object === 'run')
    const speedCall = reached.find((c) => c.path === '/speed')
    expect(speedCall, 'a speed change never reached /speed').toBeDefined()
    expect(speedCall?.body).toMatchObject({ speed: 40 })
  })

  it('Refuses a speed change with no speed in it', async () => {
    const { env } = stubEnv()
    const res = await post('/api/runs/abc/control', { action: 'speed' }, env)
    expect(res.status).toBe(400)
  })
})

describe('The playback controls', () => {
  for (const action of ['pause', 'resume', 'step', 'stop'] as const) {
    it(`Carries ${action} through to the run object`, async () => {
      const { calls, env } = stubEnv()
      const res = await post('/api/runs/abc/control', { action }, env)
      expect(res.status).toBe(200)
      const reached = calls.find((c) => c.object === 'run' && c.path === '/control')
      expect(reached, `${action} never reached the run`).toBeDefined()
      expect(JSON.stringify(reached?.body)).toContain(action)
    })
  }

  it('Refuses an action it does not know', async () => {
    const { env } = stubEnv()
    expect((await post('/api/runs/abc/control', { action: 'explode' }, env)).status).toBe(400)
  })
})

describe('The routes the page needs at all', () => {
  it('Answers what it can offer, including the turn ceiling', async () => {
    const { env } = stubEnv()
    const res = await app.request('/api/capabilities', {}, env)
    const body = await res.json<{ maxTicks: number; jevAvailable: boolean }>()
    expect(body.maxTicks).toBe(10_000)
    expect(body.jevAvailable).toBe(true)
  })

  it('Answers the defaults for every preset and refuses an unknown one', async () => {
    const { env } = stubEnv()
    for (const preset of ['small', 'medium', 'large']) {
      expect((await app.request(`/api/config/defaults?preset=${preset}`, {}, env)).status).toBe(200)
    }
    expect((await app.request('/api/config/defaults?preset=huge', {}, env)).status).toBe(400)
  })

  it('Lists runs from the registry', async () => {
    const { calls, env } = stubEnv()
    await app.request('/api/runs', {}, env)
    expect(calls.some((c) => c.object === 'registry' && c.path === '/list')).toBe(true)
  })

  it('Refuses a run longer than this deployment allows', async () => {
    const { env } = stubEnv()
    const config = { preset: 'medium', ticks: 20_000, maleMice: 30, femaleMice: 30,
      cats: 3, traps: 8, foodPiles: 60, mouseholes: 24, foodRespawnTicks: 60,
      nutritionDecayPerTick: 0.3, startingNutrition: 100, toxoplasmosisRate: 0,
      personality: { bold: 25, cautious: 25, vigilant: 25, social: 25 } }
    const res = await post('/api/runs', { config, decider: 'rules' }, env)
    expect(res.status).toBe(400)
  })

  it('Says so plainly for a route it does not have', async () => {
    const { env } = stubEnv()
    expect((await app.request('/api/nonsense', {}, env)).status).toBe(404)
  })
})
