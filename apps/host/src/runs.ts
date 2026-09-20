// Everything a run needs while it is alive: where its objects go, who is
// watching, and what the coordinator tells it. This is the same contract the
// simulation process speaks to a Run object in the deployment, answered here by
// the local filesystem so the whole application runs on one machine.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  baselineProvider, validateConfig, type DecisionProvider, type RunConfig,
} from '@jev-mice/engine'
import { jevProvider, type SystemOneLike } from '@jev-mice/provider-jev'
import {
  createSimulation, SPEED,
  type ChunkAck, type ChunkReport, type Control, type Coordinator, type Extent,
  type Frame, type LogEntry, type Simulation,
} from '@jev-mice/sim'

export type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
export type Decider = 'jev' | 'rules'

const clampSpeed = (n: number | undefined): number =>
  n === undefined || !Number.isFinite(n)
    ? SPEED.fastest
    : Math.round(Math.max(SPEED.slowest, Math.min(SPEED.fastest, n)))

export interface RunSummary {
  id: string
  status: RunStatus
  createdAt: string
  seed: number
  config: RunConfig
  currentTick: number
  queuePosition: number | null
  chunks: { seq: number; firstTick: number; lastTick: number; bytesGzip: number }[]
  totals: ChunkReport['totals']
  error: string | null
  decidedBy: Decider
  /** Ticks a second this run is paced at. */
  speed: number
  /** Highest, lowest and latest, over the whole run. */
  population: { mice: Extent; cats: Extent }
}

export type ViewerMessage =
  | { t: 'hello'; run: RunSummary; frame: Frame | null; log: LogEntry[] }
  | { t: 'frame'; frame: Frame }
  | { t: 'log'; entries: LogEntry[] }
  | { t: 'status'; run: RunSummary }
  | { t: 'error'; message: string }

export interface RunManagerOptions {
  root: string
  maxConcurrent: number
  /** Absent means every decision is computed by the fixed rules. */
  apiKey: string | null
  client?: SystemOneLike
  /** How many log lines to keep so a viewer joining late sees something at once. */
  logHistory?: number
}

export interface RunManager {
  root: string
  jevAvailable: boolean
  create(o: {
    config: RunConfig; seed: number
    /** Omitted means Jev when a key is configured and the rules otherwise. */
    decider?: Decider
    speed?: number
  }): RunSummary
  setSpeed(id: string, speed: number): boolean
  get(id: string): RunSummary | null
  list(): RunSummary[]
  control(id: string, action: 'pause' | 'resume' | 'step' | 'stop'): boolean
  watch(id: string, send: (m: ViewerMessage) => void): () => void
  snapshotOf(id: string): Frame | null
  chunkPath(id: string, seq: number): string | null
  summaryPath(id: string, seq: number): string | null
}

interface Live {
  summary: RunSummary
  sim: Simulation | null
  lastFrame: Frame | null
  /** Bounded: a long run must not grow the process's memory through its log. */
  log: LogEntry[]
  controlSeq: number
  watchers: Set<(m: ViewerMessage) => void>
  decider: Decider
}

export function createRunManager(opts: RunManagerOptions): RunManager {
  const runs = new Map<string, Live>()
  const order: string[] = []
  const queue: string[] = []
  let active = 0

  mkdirSync(opts.root, { recursive: true })

  const jevAvailable = opts.apiKey !== null || opts.client !== undefined
  const history = opts.logHistory ?? 500

  const dir = (id: string, ...rest: string[]): string =>
    join(opts.root, 'runs', id, ...rest)

  /**
   * The local stand-in for a presigned URL. It names a path under this run and
   * nothing else, so a simulation still cannot choose where its bytes land.
   */
  const grantFor = (id: string, seq: number): ChunkAck['presigned'] => ({
    chunk: dir(id, 'chunks', `${String(seq)}.json.gz`),
    summary: dir(id, 'summary', `${String(seq)}.json.gz`),
    snapshot: dir(id, 'snapshot.json.gz'),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  })

  function publish(live: Live, message: ViewerMessage): void {
    for (const send of live.watchers) {
      try { send(message) } catch { live.watchers.delete(send) }
    }
  }

  function setStatus(live: Live, status: RunStatus, error: string | null = null): void {
    live.summary.status = status
    live.summary.error = error
    publish(live, { t: 'status', run: { ...live.summary } })
  }

  function providerFor(decider: Decider): (a: { degraded: boolean }) => DecisionProvider {
    return (allowance) => {
      if (decider === 'rules' || allowance.degraded || !jevAvailable) return baselineProvider()
      const client = opts.client ?? httpClient(opts.apiKey as string)
      return jevProvider(client)
    }
  }

  function coordinatorFor(live: Live): Coordinator {
    const id = live.summary.id
    let nextSeq = 0
    const ackNow = (): ChunkAck => ({
      control: { desired: desiredFor(live), speed: live.summary.speed, seq: live.controlSeq },
      allowance: live.decider === 'rules' || !jevAvailable
        ? { tokens: 0, degraded: true, reason: 'disabled' }
        : { tokens: 1_000_000, degraded: false },
      rate: { requestsPerMinute: 600 },
      presigned: grantFor(id, nextSeq),
    })
    return {
      ready: () => {
        setStatus(live, 'running')
        return Promise.resolve(ackNow())
      },
      chunk: (report) => {
        live.summary.chunks.push({
          seq: report.seq, firstTick: report.firstTick,
          lastTick: report.lastTick, bytesGzip: report.bytesGzip,
        })
        live.summary.totals = report.totals
        live.summary.currentTick = report.totals.currentTick
        live.summary.population = report.totals.population
        nextSeq = report.seq + 1
        publish(live, { t: 'status', run: { ...live.summary } })
        return Promise.resolve(ackNow())
      },
      frames: (frames, entries) => {
        for (const frame of frames) {
          live.lastFrame = frame
          live.summary.currentTick = frame.tick
          publish(live, { t: 'frame', frame })
        }
        if (entries.length > 0) {
          live.log.push(...entries)
          if (live.log.length > history) live.log.splice(0, live.log.length - history)
          publish(live, { t: 'log', entries })
        }
        return Promise.resolve()
      },
      done: (d) => {
        live.summary.currentTick = d.finalTick
        live.summary.totals = d.totals
        live.summary.population = d.totals.population
        setStatus(live, 'completed')
        finish(id)
        return Promise.resolve()
      },
      failed: (f) => {
        live.summary.currentTick = f.atTick
        setStatus(live, 'failed', f.reason)
        finish(id)
        return Promise.resolve()
      },
    }
  }

  function desiredFor(live: Live): Control['desired'] {
    return live.summary.status === 'paused' ? 'pause' : 'run'
  }

  function upload(path: string, body: Uint8Array): Promise<void> {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, body)
    return Promise.resolve()
  }

  function begin(id: string): void {
    const live = runs.get(id)
    if (!live) return
    active += 1
    live.summary.queuePosition = null
    const sim = createSimulation({
      runId: id,
      config: live.summary.config,
      seed: live.summary.seed,
      coordinator: coordinatorFor(live),
      upload,
      provider: providerFor(live.decider),
    })
    live.sim = sim
    void sim.start()
  }

  function finish(id: string): void {
    active = Math.max(0, active - 1)
    const next = queue.shift()
    if (next !== undefined) {
      renumberQueue()
      begin(next)
    } else {
      renumberQueue()
    }
  }

  function renumberQueue(): void {
    queue.forEach((qid, i) => {
      const live = runs.get(qid)
      if (live) live.summary.queuePosition = i + 1
    })
  }

  return {
    root: opts.root,

    jevAvailable,

    create({ config, seed, decider, speed }) {
      const errors = validateConfig(config)
      if (errors.length > 0) {
        throw new Error(errors.map((e) => `${e.field}: ${e.message}`).join('; '))
      }
      const chosen: Decider = decider ?? (jevAvailable ? 'jev' : 'rules')
      if (chosen === 'jev' && !jevAvailable) {
        throw new Error('no decision key is configured, so Jev cannot be asked; '
          + 'set TYPESAFE_API_KEY or choose the rules')
      }
      const id = randomUUID()
      mkdirSync(dir(id, 'chunks'), { recursive: true })
      mkdirSync(dir(id, 'summary'), { recursive: true })
      const summary: RunSummary = {
        id,
        status: 'queued',
        createdAt: new Date().toISOString(),
        seed,
        config,
        currentTick: 0,
        queuePosition: null,
        chunks: [],
        totals: {
          currentTick: 0, requests: 0, inputTokens: 0, fallbackCount: 0,
          population: { mice: blank(), cats: blank() },
        },
        error: null,
        decidedBy: chosen,
        // Slow by default: the first thing anyone sees should be watchable, and
        // the slider is right there for anyone who wants it faster.
        speed: speed === undefined ? SPEED.slowest : clampSpeed(speed),
        population: { mice: blank(), cats: blank() },
      }
      const live: Live = {
        summary, sim: null, lastFrame: null, log: [], controlSeq: 0,
        watchers: new Set(), decider: chosen,
      }
      runs.set(id, live)
      order.unshift(id)
      writeFileSync(dir(id, 'run.json'), JSON.stringify({ id, seed, config }, null, 2))

      if (active < opts.maxConcurrent) begin(id)
      else { queue.push(id); renumberQueue() }
      return { ...summary }
    },

    get: (id) => {
      const live = runs.get(id)
      return live ? { ...live.summary } : null
    },

    list: () => order.map((id) => runs.get(id)).filter((l): l is Live => l !== undefined)
      .map((l) => ({ ...l.summary })),

    setSpeed(id, speed) {
      const live = runs.get(id)
      if (!live?.sim) return false
      live.summary.speed = clampSpeed(speed)
      live.controlSeq += 1
      live.sim.control({
        desired: live.summary.status === 'paused' ? 'pause' : 'run',
        speed: live.summary.speed,
        seq: live.controlSeq,
      })
      publish(live, { t: 'status', run: { ...live.summary } })
      return true
    },

    control(id, action) {
      const live = runs.get(id)
      if (!live || !live.sim) return false
      live.controlSeq += 1
      const desired = action === 'resume' ? 'run' : action === 'stop' ? 'stop' : action
      if (action === 'pause') setStatus(live, 'paused')
      if (action === 'resume') setStatus(live, 'running')
      live.sim.control({ desired, speed: live.summary.speed, seq: live.controlSeq })
      return true
    },

    watch(id, send) {
      const live = runs.get(id)
      if (!live) {
        send({ t: 'error', message: 'no such run' })
        return () => undefined
      }
      live.watchers.add(send)
      send({
        t: 'hello', run: { ...live.summary }, frame: live.lastFrame,
        log: [...live.log],
      })
      return () => live.watchers.delete(send)
    },

    snapshotOf: (id) => runs.get(id)?.lastFrame ?? null,

    chunkPath(id, seq) {
      const p = dir(id, 'chunks', `${String(seq)}.json.gz`)
      return existsSync(p) ? p : null
    },

    summaryPath(id, seq) {
      const p = dir(id, 'summary', `${String(seq)}.json.gz`)
      return existsSync(p) ? p : null
    },
  }
}

const blank = (): Extent => ({ peak: 0, min: 0, current: 0 })

/** The only place a key is used, and it never leaves this process. */
function httpClient(apiKey: string): SystemOneLike {
  const baseURL = process.env.TYPESAFE_BASE_URL ?? 'https://api.typesafe.ai'
  const model = process.env.TYPESAFE_DEFAULT_MODEL ?? 'jev-latest'
  return {
    async systemOne(request, options) {
      const response = await fetch(`${baseURL}/v1/systemone`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, ...request }),
        ...(options?.signal ? { signal: options.signal } : {}),
      })
      if (!response.ok) {
        throw new Error(`decision service answered ${String(response.status)}`)
      }
      return await response.json() as Awaited<ReturnType<SystemOneLike['systemOne']>>
    },
  }
}

export { readFileSync, readdirSync }
