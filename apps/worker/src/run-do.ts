// One of these per run. It owns the engine, advances it a batch of ticks per
// alarm, writes chunks to R2 and pushes frames to whoever is watching.
//
// This is what ADR-025 decided instead of a container. The engine has no
// dependencies and the Jev provider is fetch-based, so both run here unchanged;
// events drain into chunks so memory is bounded by the chunk rather than the
// run; and snapshot and resume are verified byte-identical, so a run advanced
// in batches is the same run as one advanced in a single pass. That last point
// is asserted in apps/sim/test/sim.spec.ts, not assumed here.
//
// Between batches the object is idle and hibernates. A run nobody is watching
// costs its storage and nothing else.

import {
  baselineProvider, validateConfig,
  type DecisionProvider, type RunConfig, type Snapshot,
} from '@jev-mice/engine'
import { jevProvider } from '@jev-mice/provider-jev'
import {
  createSimulation, SPEED,
  type Allowance, type ChunkAck, type Control, type Coordinator, type Decider,
  type Extent, type Frame, type LogEntry, type RunStatus, type RunSummary,
  type ViewerMessage,
} from '@jev-mice/sim'
import { batchSize } from './batching.js'
import { httpClient } from './jev.js'
import type { Env } from './env.js'

/** Log lines kept for someone who joins part way through. */
const LOG_TAIL = 400

const blank = (): Extent => ({ peak: 0, min: 0, current: 0 })
const isOver = (s: RunStatus): boolean =>
  s === 'completed' || s === 'failed' || s === 'cancelled'

interface Stored {
  summary: RunSummary
  control: Control
  snapshot: Snapshot | null
  lastFrame: Frame | null
  log: LogEntry[]
}

export class RunDO implements DurableObject {
  readonly #state: DurableObjectState
  readonly #env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.#state = state
    this.#env = env
  }

  // ---- storage -------------------------------------------------------------

  async #get<K extends keyof Stored>(key: K): Promise<Stored[K] | undefined> {
    return await this.#state.storage.get<Stored[K]>(key)
  }

  async #put<K extends keyof Stored>(key: K, value: Stored[K]): Promise<void> {
    await this.#state.storage.put(key, value)
  }

  // ---- viewers -------------------------------------------------------------

  /**
   * Hibernatable, so the object can sleep between batches with sockets still
   * attached. A plain socket would pin it awake for the life of the run.
   */
  #publish(message: ViewerMessage): void {
    const text = JSON.stringify(message)
    for (const ws of this.#state.getWebSockets()) {
      try { ws.send(text) } catch { /* the close handler will clean up */ }
    }
  }

  async webSocketMessage(_ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let msg: { t?: string; action?: string; speed?: number }
    try { msg = JSON.parse(String(raw)) as typeof msg } catch { return }
    if (msg.t === 'control' && typeof msg.action === 'string') {
      await this.#control(msg.action)
    }
    if (msg.t === 'speed' && typeof msg.speed === 'number') {
      await this.#setSpeed(msg.speed)
    }
  }

  webSocketClose(): void { /* nothing to unwind: state lives in storage */ }
  webSocketError(): void { /* as above */ }

  // ---- control -------------------------------------------------------------

  async #control(action: string): Promise<void> {
    const summary = await this.#get('summary')
    const control = await this.#get('control')
    if (!summary || !control || isOver(summary.status)) return

    const next: Control = { ...control, seq: control.seq + 1 }
    if (action === 'pause') { next.desired = 'pause'; summary.status = 'paused' }
    else if (action === 'resume') { next.desired = 'run'; summary.status = 'running' }
    else if (action === 'step') { next.desired = 'step' }
    else if (action === 'stop') { next.desired = 'stop'; summary.status = 'cancelled' }
    else return

    await this.#put('control', next)
    await this.#put('summary', summary)
    this.#publish({ t: 'status', run: summary })
    // A paused run still wakes, so a resume is noticed without a viewer poking it.
    await this.#state.storage.setAlarm(Date.now() + 100)
  }

  async #setSpeed(speed: number): Promise<void> {
    const summary = await this.#get('summary')
    const control = await this.#get('control')
    if (!summary || !control) return
    const clamped = Math.max(SPEED.slowest, Math.min(SPEED.fastest, Math.round(speed)))
    summary.speed = clamped
    await this.#put('summary', summary)
    await this.#put('control', { ...control, speed: clamped, seq: control.seq + 1 })
    this.#publish({ t: 'status', run: summary })
  }

  // ---- the budget ----------------------------------------------------------

  /** Tell the list page this run exists, or that it has moved on. */
  async #announce(summary: RunSummary): Promise<void> {
    try {
      await this.#env.REGISTRY.get(this.#env.REGISTRY.idFromName('global'))
        .fetch('https://registry/put', { method: 'POST', body: JSON.stringify(summary) })
    } catch { /* the run matters more than the list of runs */ }
  }

  #budget(): DurableObjectStub {
    return this.#env.BUDGET.get(this.#env.BUDGET.idFromName('global'))
  }

  async #allowanceFor(decider: Decider): Promise<Allowance> {
    if (decider === 'rules' || !this.#env.TYPESAFE_API_KEY) {
      return { tokens: 0, degraded: true, reason: 'disabled' }
    }
    try {
      const r = await this.#budget().fetch('https://budget/grant')
      return await r.json<Allowance>()
    } catch {
      // A budget that cannot be reached is treated as spent. Failing towards
      // the rules costs accuracy; failing towards Jev costs money.
      return { tokens: 0, degraded: true, reason: 'global_budget' }
    }
  }

  async #recordUsage(used: { requests: number; inputTokens: number }): Promise<void> {
    if (used.requests === 0 && used.inputTokens === 0) return
    try {
      await this.#budget().fetch('https://budget/record', {
        method: 'POST', body: JSON.stringify(used),
      })
    } catch { /* the run continues; the next grant will be stale by this much */ }
  }

  // ---- advancing -----------------------------------------------------------

  async alarm(): Promise<void> {
    const summary = await this.#get('summary')
    const control = await this.#get('control')
    if (!summary || !control) return
    if (isOver(summary.status)) return

    if (control.desired === 'pause' && summary.status === 'paused') {
      // Idle, but awake often enough to notice a resume.
      await this.#state.storage.setAlarm(Date.now() + 1_000)
      return
    }

    const ticks = batchSize(summary.speed, summary.config.ticks, summary.currentTick)
    if (ticks === 0) { await this.#finish('completed'); return }

    const allowance = await this.#allowanceFor(summary.decidedBy)
    const snapshot = await this.#get('snapshot')
    const log = await this.#get('log') ?? []

    let nextSeq = summary.chunks.length
    let engineRef: { serialize(): Snapshot } | null = null
    const usage = { requests: 0, inputTokens: 0 }

    const ackNow = (): ChunkAck => ({
      control: { desired: control.desired, speed: summary.speed, seq: control.seq },
      allowance,
      rate: { requestsPerMinute: 600 },
      presigned: {
        chunk: `runs/${summary.id}/chunks/${String(nextSeq)}.json.gz`,
        summary: `runs/${summary.id}/summary/${String(nextSeq)}.json.gz`,
        snapshot: `runs/${summary.id}/snapshot.json.gz`,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })

    const coordinator: Coordinator = {
      ready: () => Promise.resolve(ackNow()),
      chunk: async (report) => {
        summary.chunks.push({
          seq: report.seq, firstTick: report.firstTick,
          lastTick: report.lastTick, bytesGzip: report.bytesGzip,
        })
        summary.totals = report.totals
        summary.currentTick = report.totals.currentTick
        summary.population = report.totals.population
        nextSeq = report.seq + 1
        usage.requests += report.usage.requests
        usage.inputTokens += report.usage.inputTokens
        this.#publish({ t: 'status', run: summary })
        return ackNow()
      },
      frames: (frames, entries) => {
        for (const frame of frames) {
          summary.currentTick = frame.tick
          this.#publish({ t: 'frame', frame })
        }
        if (frames.length > 0) void this.#put('lastFrame', frames[frames.length - 1]!)
        if (entries.length > 0) {
          log.push(...entries)
          if (log.length > LOG_TAIL) log.splice(0, log.length - LOG_TAIL)
          this.#publish({ t: 'log', entries })
        }
        return Promise.resolve()
      },
      done: async (d) => {
        summary.currentTick = d.finalTick
        summary.totals = d.totals
        summary.population = d.totals.population
        summary.endReason = d.reason
      },
      failed: async (f) => {
        summary.status = 'failed'
        summary.error = f.reason
      },
    }

    const sim = createSimulation({
      runId: summary.id,
      config: summary.config,
      seed: summary.seed,
      coordinator,
      upload: async (key, body) => {
        await this.#env.RECORDS.put(key, body as unknown as ArrayBuffer)
      },
      provider: (a) => this.#providerFor(summary.decidedBy, a),
      onEngine: (e) => { engineRef = e },
    })

    let finished = false
    try {
      const out = await sim.start({
        ...(snapshot ? { snapshot } : {}),
        // Carried over, or the run would report the population extremes and
        // the Jev usage of this batch alone.
        ...(snapshot ? { totals: summary.totals } : {}),
        until: summary.currentTick + ticks,
      })
      finished = out.finished
      summary.currentTick = out.tick
    } catch (err) {
      summary.status = 'failed'
      summary.error = err instanceof Error ? err.message : String(err)
      finished = true
    }

    // Kept alongside R2 so the next batch resumes without a round trip.
    if (engineRef !== null) {
      await this.#put('snapshot', (engineRef as { serialize(): Snapshot }).serialize())
    }
    await this.#put('log', log)
    await this.#recordUsage(usage)

    if (summary.status === 'failed') {
      await this.#put('summary', summary)
      await this.#announce(summary)
      this.#publish({ t: 'status', run: summary })
      return
    }
    if (control.desired === 'stop') { await this.#finishWith(summary, 'cancelled'); return }
    if (finished) { await this.#finishWith(summary, 'completed'); return }

    // A step advances one batch and then holds, so the result can be looked at.
    if (control.desired === 'step') {
      summary.status = 'paused'
      await this.#put('control', { ...control, desired: 'pause', seq: control.seq + 1 })
    }
    await this.#put('summary', summary)
    await this.#announce(summary)
    this.#publish({ t: 'status', run: summary })
    await this.#state.storage.setAlarm(Date.now() + 1)
  }

  #providerFor(decider: Decider, allowance: { degraded: boolean }): DecisionProvider {
    if (decider === 'rules' || allowance.degraded || !this.#env.TYPESAFE_API_KEY) {
      return baselineProvider()
    }
    return jevProvider(httpClient(this.#env))
  }

  async #finish(status: RunStatus): Promise<void> {
    const summary = await this.#get('summary')
    if (summary) await this.#finishWith(summary, status)
  }

  async #finishWith(summary: RunSummary, status: RunStatus): Promise<void> {
    summary.status = status
    summary.queuePosition = null
    await this.#put('summary', summary)
    await this.#announce(summary)
    this.#publish({ t: 'status', run: summary })
  }

  // ---- requests ------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/start') {
      const body = await request.json<{
        id: string; config: RunConfig; seed: number; decider: Decider; speed?: number
      }>()
      const errors = validateConfig(body.config)
      if (errors.length > 0) return Response.json({ errors }, { status: 400 })
      if (await this.#get('summary')) {
        return Response.json({ error: 'this run already exists' }, { status: 409 })
      }
      const summary: RunSummary = {
        id: body.id,
        status: 'running',
        createdAt: new Date().toISOString(),
        seed: body.seed,
        config: body.config,
        currentTick: 0,
        queuePosition: null,
        chunks: [],
        totals: {
          currentTick: 0, requests: 0, inputTokens: 0, fallbackCount: 0,
          population: { mice: blank(), cats: blank() },
        },
        error: null,
        decidedBy: body.decider,
        speed: Math.max(SPEED.slowest,
          Math.min(SPEED.fastest, Math.round(body.speed ?? SPEED.slowest))),
        population: { mice: blank(), cats: blank() },
        endReason: null,
      }
      await this.#put('summary', summary)
      await this.#announce(summary)
      await this.#put('control', { desired: 'run', speed: summary.speed, seq: 0 })
      await this.#put('log', [])
      await this.#state.storage.setAlarm(Date.now() + 1)
      return Response.json({ run: summary }, { status: 201 })
    }

    if (path === '/state') {
      const summary = await this.#get('summary')
      if (!summary) return Response.json({ error: 'no such run' }, { status: 404 })
      return Response.json({ run: summary })
    }

    if (path === '/control' && request.method === 'POST') {
      const { action } = await request.json<{ action: string }>()
      await this.#control(action)
      const summary = await this.#get('summary')
      return Response.json({ run: summary })
    }

    if (path === '/speed' && request.method === 'POST') {
      const { speed } = await request.json<{ speed: number }>()
      await this.#setSpeed(speed)
      return Response.json({ run: await this.#get('summary') })
    }

    if (path === '/stream') {
      if (request.headers.get('upgrade') !== 'websocket') {
        return new Response('expected a websocket', { status: 426 })
      }
      const summary = await this.#get('summary')
      if (!summary) return new Response('no such run', { status: 404 })
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      this.#state.acceptWebSocket(server)
      server.send(JSON.stringify({
        t: 'hello',
        run: summary,
        frame: await this.#get('lastFrame') ?? null,
        log: await this.#get('log') ?? [],
      } satisfies ViewerMessage))
      return new Response(null, { status: 101, webSocket: client })
    }

    return new Response('no such route', { status: 404 })
  }
}
