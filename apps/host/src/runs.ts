// Everything a run needs while it is alive: where its objects go, who is
// watching, and what the coordinator tells it. This is the same contract the
// simulation process speaks to a Run object in the deployment, answered here by
// the local filesystem so the whole application runs on one machine.

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  baselineProvider, validateConfig, type DecisionProvider, type RunConfig,
} from '@jev-mice/engine'
import { jevProvider, type SystemOneLike } from '@jev-mice/provider-jev'

import {
  createSimulation, forget, SPEED, SPEED_CEILING,
  type ChunkAck, type ChunkReport, type Control, type Coordinator, type Decider,
  type DecisionLine, type Extent, type Frame, type LogEntry, type RunStatus, type RunSummary,
  type Simulation, type ViewerMessage,
} from '@jev-mice/sim'

export type { Decider, RunStatus, RunSummary, ViewerMessage } from '@jev-mice/sim'

/** Runs kept before the oldest finished one is dropped. */
export const DEFAULT_MAX_RUNS = 200

/**
 * A pace this run can actually be given.
 *
 * Clamped to the decider's own ceiling rather than the engine's. Jev answers at
 * about six turns a second, so accepting 334 for a Jev run would store a number
 * the run could never honour and report it back to the page as though it had.
 */
const clampSpeed = (n: number | undefined, decider: Decider): number => {
  const ceiling = SPEED_CEILING[decider]
  return n === undefined || !Number.isFinite(n)
    ? ceiling
    : Math.round(Math.max(SPEED.slowest, Math.min(ceiling, n)))
}

export interface RunManagerOptions {
  root: string
  maxConcurrent: number
  /** Absent means every decision is computed by the fixed rules. */
  apiKey: string | null
  client?: SystemOneLike
  /** How many log lines to keep so a viewer joining late sees something at once. */
  logHistory?: number
  /**
   * How many runs this host keeps. Starting one past the window deletes the
   * oldest finished run, so a new run always starts; only runs that are still
   * going are never touched. Nothing evicts on its own, so a host left alone
   * holds exactly what it was given.
   */
  maxRuns?: number
}

export interface RunManager {
  root: string
  jevAvailable: boolean
  /** Runs, newest first. */
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
  /** Kept for a viewer that joins part way through, as the log is. */
  decisions: DecisionLine[]
  controlSeq: number
  /**
   * What this run was last told to do. Held rather than derived from the
   * status, which knows about paused and not about stopped: deriving it meant a
   * chunk acknowledgement landing after a stop told the run to carry on.
   */
  desired: Control['desired']
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
  const window = opts.maxRuns ?? DEFAULT_MAX_RUNS

  const isOver = (s: RunStatus): boolean =>
    s === 'completed' || s === 'failed' || s === 'cancelled'

  /**
   * Make room for one more. The oldest finished run goes, with its files and
   * its cached telemetry. A run that is still going or still waiting is never
   * evicted, so a host busy with long runs refuses rather than losing work.
   */
  function makeRoom(): void {
    while (order.length >= window) {
      // order is newest first, so the last finished entry is the oldest.
      const victim = [...order].reverse().find((id) => {
        const live = runs.get(id)
        return live !== undefined && isOver(live.summary.status)
      })
      if (victim === undefined) {
        throw new Error(`this host keeps at most ${String(window)} runs and all of `
          + 'them are still going; stop one or wait for it to finish')
      }
      for (const send of runs.get(victim)?.watchers ?? []) {
        try { send({ t: 'error', message: 'this run was removed to make room' }) } catch { /* gone */ }
      }
      runs.delete(victim)
      order.splice(order.indexOf(victim), 1)
      forget(victim)
      rmSync(dir(victim), { recursive: true, force: true })
    }
  }

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
      control: { desired: live.desired, speed: live.summary.speed, seq: live.controlSeq },
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
      frames: (frames, entries, decisions) => {
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
        if (decisions && decisions.length > 0) {
          live.decisions.push(...decisions)
          if (live.decisions.length > history) {
            live.decisions.splice(0, live.decisions.length - history)
          }
          publish(live, { t: 'decisions', entries: decisions })
        }
        return Promise.resolve()
      },
      done: (d) => {
        live.summary.currentTick = d.finalTick
        live.summary.totals = d.totals
        live.summary.population = d.totals.population
        live.summary.endReason = d.reason
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
      makeRoom()
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
        speed: speed === undefined ? SPEED.slowest : clampSpeed(speed, chosen),
        population: { mice: blank(), cats: blank() },
        endReason: null,
      }
      const live: Live = {
        summary, sim: null, lastFrame: null, log: [], decisions: [], controlSeq: 0,
        desired: 'run', watchers: new Set(), decider: chosen,
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
      live.summary.speed = clampSpeed(speed, live.decider)
      live.controlSeq += 1
      live.sim.control({
        desired: live.desired,
        speed: live.summary.speed,
        seq: live.controlSeq,
      })
      publish(live, { t: 'status', run: { ...live.summary } })
      return true
    },

    control(id, action) {
      const live = runs.get(id)
      if (!live) return false
      if (!live.sim) {
        // Queued: there is no simulation to tell anything. Stopping one is still
        // meaningful and used to be refused outright, which left a backlog with
        // no way out but waiting. Pausing or stepping is not: there is nothing
        // to pause, and saying otherwise would report a state it is not in.
        if (action !== 'stop') return false
        const at = queue.indexOf(id)
        if (at !== -1) queue.splice(at, 1)
        live.desired = 'stop'
        live.summary.queuePosition = null
        setStatus(live, 'cancelled')
        // The queue has to move on, or a slot sits idle with runs waiting for it.
        renumberQueue()
        return true
      }
      live.controlSeq += 1
      const desired = action === 'resume' ? 'run' : action === 'stop' ? 'stop' : action
      // A step is one turn and then a hold, so what it leaves behind is a pause.
      live.desired = action === 'step' ? 'pause' : desired
      // A step is one turn out of a pause and a pause again, so the run is
      // paused afterwards and has to say so. Reporting it as running left the
      // page offering a pause button for something already stopped.
      if (action === 'pause' || action === 'step') setStatus(live, 'paused')
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
        decisions: [...live.decisions],
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
