// The Worker: routing, and nothing else.
//
// Every run is a Durable Object, so these handlers mostly name the right object
// and pass the request on. What little logic lives here is the part that must
// not be inside a run: validating a configuration before an object is made for
// it, and keeping the key away from the browser.
//
// The routes match apps/host exactly, so the same viewer runs against a laptop
// and against the deployment without knowing which it is talking to.

import { Hono } from 'hono'
import { defaultConfig, validateConfig, type Preset, type RunConfig } from '@jev-mice/engine'
import { SPEED, type Decider } from '@jev-mice/sim'
import { beaconTag } from './analytics.js'
import { tickCeiling, tooManyTicks } from './limits.js'
import { httpsRedirect } from './https.js'
import type { Env } from './env.js'

export { RunDO } from './run-do.js'
export { BudgetDO } from './budget-do.js'
export { RegistryDO } from './registry-do.js'

const PRESETS: Preset[] = ['small', 'medium', 'large']

const app = new Hono<{ Bindings: Env }>()

// Before anything else, including the assets. Plain HTTP used to answer with
// the application, which teaches people the insecure URL works and it is the
// one they paste to someone else.
app.use('*', async (c, next) => {
  const redirect = httpsRedirect(c.req.raw)
  if (redirect) return redirect
  await next()
})

const runStub = (env: Env, id: string): DurableObjectStub =>
  env.RUN.get(env.RUN.idFromName(id))

const registry = (env: Env): DurableObjectStub =>
  env.REGISTRY.get(env.REGISTRY.idFromName('global'))

app.get('/api/capabilities', (c) => c.json({
  // Whether a key exists, never the key. The page decides what to offer from
  // this and learns nothing else.
  jevAvailable: Boolean(c.env.TYPESAFE_API_KEY),
  speed: { slowest: SPEED.slowest, fastest: SPEED.fastest },
  // So the form offers what the deployment will actually accept, rather than
  // offering 20,000 and refusing it on submit.
  maxTicks: tickCeiling(c.env),
}))

app.get('/api/config/defaults', (c) => {
  const preset = c.req.query('preset') ?? 'medium'
  if (!PRESETS.includes(preset as Preset)) {
    return c.json({ error: 'unknown preset' }, 400)
  }
  return c.json({ config: defaultConfig(preset as Preset) })
})

app.get('/api/runs', async (c) => {
  const r = await registry(c.env).fetch('https://registry/list')
  return c.json(await r.json())
})

app.post('/api/runs', async (c) => {
  const body = await c.req.json<{
    config?: RunConfig; seed?: number; decider?: string; speed?: number
  }>()
  if (!body.config) return c.json({ error: 'a configuration is required' }, 400)
  const errors = validateConfig(body.config)
  // The deployment's own ceiling, checked here because the form is a suggestion
  // and this is where a run actually comes into being.
  const tooLong = tooManyTicks(body.config.ticks, tickCeiling(c.env))
  if (tooLong) errors.push(tooLong)
  if (errors.length > 0) return c.json({ errors }, 400)
  if (body.decider !== undefined && body.decider !== 'jev' && body.decider !== 'rules') {
    return c.json({ error: 'decider must be jev or rules' }, 400)
  }
  const seed = Number.isFinite(body.seed)
    ? Number(body.seed)
    : Math.floor(Math.random() * 2 ** 31)
  const id = crypto.randomUUID()
  const r = await runStub(c.env, id).fetch('https://run/start', {
    method: 'POST',
    body: JSON.stringify({
      id,
      config: body.config,
      seed,
      decider: (body.decider ?? 'jev') as Decider,
      ...(body.speed === undefined ? {} : { speed: body.speed }),
    }),
  })
  return new Response(r.body, { status: r.status, headers: r.headers })
})

app.get('/api/runs/:id', async (c) => {
  const r = await runStub(c.env, c.req.param('id')).fetch('https://run/state')
  return new Response(r.body, { status: r.status, headers: r.headers })
})

app.post('/api/runs/:id/control', async (c) => {
  const r = await runStub(c.env, c.req.param('id')).fetch('https://run/control', {
    method: 'POST', body: JSON.stringify(await c.req.json()),
  })
  return new Response(r.body, { status: r.status, headers: r.headers })
})

app.post('/api/runs/:id/speed', async (c) => {
  const r = await runStub(c.env, c.req.param('id')).fetch('https://run/speed', {
    method: 'POST', body: JSON.stringify(await c.req.json()),
  })
  return new Response(r.body, { status: r.status, headers: r.headers })
})

app.get('/api/runs/:id/stream', (c) => {
  if (c.req.header('upgrade') !== 'websocket') {
    return c.text('expected a websocket', 426)
  }
  // Straight through to the run's own object, which owns the sockets so it can
  // hibernate with them attached.
  return runStub(c.env, c.req.param('id')).fetch(
    new Request('https://run/stream', c.req.raw))
})

/**
 * Stored objects, read back for replay and the turn-by-turn view.
 *
 * Served as opaque gzip, exactly as the local host serves the same route: the
 * caller decompresses. Declaring content-encoding instead would be a claim
 * about the transfer rather than the body, and the runtime compressed the
 * already-compressed bytes a second time -- a chunk came back double-gzipped
 * and unreadable by anything that unzipped it once.
 */
const object = async (c: { env: Env }, key: string): Promise<Response> => {
  const got = await c.env.RECORDS.get(key)
  if (!got) return new Response('no such object', { status: 404 })
  return new Response(got.body, {
    headers: {
      'content-type': 'application/gzip',
      'cache-control': 'private, max-age=31536000, immutable',
    },
  })
}

app.get('/api/runs/:id/chunks/:seq', (c) =>
  object(c, `runs/${c.req.param('id')}/chunks/${c.req.param('seq')}.json.gz`))

app.get('/api/runs/:id/summary/:seq', (c) =>
  object(c, `runs/${c.req.param('id')}/summary/${c.req.param('seq')}.json.gz`))

app.all('/api/*', (c) => c.json({ error: 'no such route' }, 404))

// Everything else is the viewer, served from the built assets.
//
// The usage beacon is added here rather than baked into the built page, so the
// token stays a deployment setting and a build carries no site's identity. A
// deployment without a token serves the page untouched.
app.all('*', async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw)
  const tag = beaconTag(c.env.CF_ANALYTICS_TOKEN)
  if (tag === null) return response
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return response
  return new HTMLRewriter()
    .on('body', {
      element(el) { el.append(tag, { html: true }) },
    })
    .transform(response)
})

export default app
