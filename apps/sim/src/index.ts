// The simulation process. It owns the loop, closes chunks, uploads what it
// produced through URLs it was handed, and reports sizes rather than keys, so
// it can neither name nor reach an object it was not given.

import { gzipSync } from 'node:zlib'
import {
  createEngine, restore, ENGINE_VERSION, hungerBand,
  type Engine, type SimEvent,
} from '@jev-mice/engine'
import type {
  Allowance, ChunkAck, ChunkBody, ChunkReport, Control, EndReason, Extent, Frame,
  LogEntry, Simulation, SimulationOptions, SummaryBody, SummaryPoint,
} from './types.js'

export * from './types.js'

/** A chunk closes at whichever of these comes first. */
export const CHUNK_TICKS = 250
export const CHUNK_BYTES = 8 * 1024 * 1024
/**
 * How often a viewer hears from a running simulation. The tick interval follows
 * the pace, so a run at one tick a second is watchable and a run at full speed
 * does not flood the socket. Either way a pending frame goes out within
 * FRAME_FLUSH_MS, which is what stops a slow run looking frozen.
 */
export const FRAMES_PER_SECOND = 20
export const FRAME_EVERY_TICKS = 5
export const FRAME_BATCH = 4
export const FRAME_FLUSH_MS = 100
/** How often the loop returns to the event queue so a pushed control lands. */
const YIELD_EVERY_TICKS = 8
/** How long the loop naps when it is ahead of the pace it was asked for. */
const PACE_NAP_MS = 4

const encode = (v: unknown): { raw: number; gzip: Uint8Array } => {
  const text = JSON.stringify(v)
  return { raw: Buffer.byteLength(text, 'utf8'), gzip: gzipSync(text) }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const wallClock = (): number => Date.now()

export function createSimulation(opts: SimulationOptions): Simulation {
  // The only wall clock the process reads. The engine never sees it.
  const now = opts.now ?? wallClock
  let engine: Engine | null = null
  let tick = 0
  let chunkSeq = 0
  let chunkFirstTick = 1
  let buffered: SimEvent[] = []
  let bufferedBytes = 0
  let points: SummaryPoint[] = []
  let pendingFrames: Frame[] = []
  let pendingLog: LogEntry[] = []
  /** The last decision each agent was given, so a death can name its cause. */
  const lastDecision = new Map<string, { intent: string; source: 'jev' | 'baseline' }>()
  let control: Control = { desired: 'run', speed: 0, seq: -1 }
  /** Set when the engine stops itself, which it does on extinction. */
  let engineEnded: EndReason | null = null
  let stepsOwed = 0
  let allowance: Allowance = { tokens: 0, degraded: true, reason: 'disabled' }
  let presigned: ChunkAck['presigned'] | null = null

  const extent = (n: number): Extent => ({ peak: n, min: n, current: n })
  const widen = (e: Extent, n: number): void => {
    e.current = n
    if (n > e.peak) e.peak = n
    if (n < e.min) e.min = n
  }

  const totals = {
    currentTick: 0, requests: 0, inputTokens: 0, fallbackCount: 0,
    population: { mice: extent(0), cats: extent(0) },
  }
  let sinceChunk = { requests: 0, inputTokens: 0, fallbacks: 0, model: null as string | null }

  function applyAck(ack: ChunkAck): void {
    if (ack.control.seq >= control.seq) control = ack.control
    const changed = ack.allowance.degraded !== allowance.degraded
    allowance = ack.allowance
    presigned = ack.presigned
    if (changed) rebuildProvider()
  }

  // Built from the first acknowledgement rather than eagerly, so it is never
  // constructed against the placeholder allowance held before the run starts.
  let provider: import('@jev-mice/engine').DecisionProvider | null = null
  function rebuildProvider(): void { provider = opts.provider(allowance) }
  const currentProvider = (): import('@jev-mice/engine').DecisionProvider =>
    (provider ??= opts.provider(allowance))

  /** The engine holds one provider for its lifetime, so this forwards to the current one. */
  const forwarding = {
    decide: (requests: Parameters<
      import('@jev-mice/engine').DecisionProvider['decide']>[0]) =>
      currentProvider().decide(requests),
  }

  /** Reads as a sentence, so the page shows it without rephrasing anything. */
  function logFrom(events: readonly SimEvent[], atTick: number): void {
    for (const e of events) {
      const of = (id: string): Pick<LogEntry, 'decision' | 'decidedBy'> => {
        const d = lastDecision.get(id)
        return d === undefined ? {} : { decision: d.intent, decidedBy: d.source }
      }
      switch (e.kind) {
        case 'death': {
          const kind = e.cause === 'starvation' ? 'starved'
            : e.cause === 'cat' ? 'eaten' : 'trapped'
          if (kind === 'starved') {
            pendingLog.push({
              tick: atTick, kind, subject: e.id,
              text: `${e.id} starved.`, ...of(e.id),
            })
          }
          // A cat kill and a trap death are named by the events that caused
          // them, which carry the cat or the trap. Naming them here too would
          // log the same loss twice.
          break
        }
        case 'capture':
          pendingLog.push({
            tick: atTick, kind: 'eaten', subject: e.mouseId,
            text: `${e.mouseId} was caught by ${e.catId}.`, ...of(e.mouseId),
          })
          break
        case 'mouse_trapped':
          pendingLog.push({
            tick: atTick, kind: 'trapped', subject: e.id,
            text: `${e.id} died in ${e.trapId}.`, ...of(e.id),
          })
          break
        case 'birth':
          pendingLog.push({
            tick: atTick, kind: 'born', subject: e.pupId,
            text: `${e.pupId} was born to ${e.motherId}, ${e.personality} and ${e.sex}.`,
          })
          break
        case 'mating':
          pendingLog.push({
            tick: atTick, kind: 'mated', subject: e.a,
            text: `${e.a} and ${e.b} mated in ${e.holeId}.`, ...of(e.a),
          })
          break
        case 'cat_died':
          pendingLog.push({
            tick: atTick, kind: 'cat_starved', subject: e.id,
            text: `${e.id} starved, with nothing left to catch.`,
          })
          break
        case 'cap_limited_birth':
          pendingLog.push({
            tick: atTick, kind: 'birth_lost', subject: e.motherId,
            text: `${String(e.lost)} of ${e.motherId}'s litter had nowhere to go; `
              + 'the world is full.',
          })
          break
        default:
          break
      }
    }
  }

  function accumulate(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind === 'decision_returned') {
        for (const s of e.subjects) {
          lastDecision.set(s.agentId, { intent: s.intent, source: e.source })
        }
        if (e.source === 'jev') {
          sinceChunk.requests += 1
          sinceChunk.inputTokens += e.inputTokens ?? 0
          sinceChunk.model = e.model ?? sinceChunk.model
        } else {
          sinceChunk.fallbacks += 1
        }
      }
    }
  }

  function summarize(events: readonly SimEvent[], atTick: number): void {
    const view = engine?.world()
    const alive = view?.mice.filter((m) => !m.inHole) ?? []
    const mean = alive.length === 0 ? 0
      : alive.reduce((t, m) => t + m.nutrition, 0) / alive.length
    const deaths = { starvation: 0, trap: 0, cat: 0 }
    let births = 0
    let judged = 0
    let fallbacks = 0
    for (const e of events) {
      if (e.kind === 'death') deaths[e.cause] += 1
      if (e.kind === 'birth') births += 1
      if (e.kind === 'decision_returned') (e.source === 'jev' ? judged++ : fallbacks++)
    }
    widen(totals.population.mice, view?.mice.length ?? 0)
    widen(totals.population.cats, view?.cats.length ?? 0)
    points.push({
      tick: atTick,
      population: view?.mice.length ?? 0,
      cats: view?.cats.length ?? 0,
      food: view?.food.filter((f) => f.present).length ?? 0,
      traps: view?.traps.filter((x) => x.occupantId === null).length ?? 0,
      births,
      deathsByStarvation: deaths.starvation,
      deathsByTrap: deaths.trap,
      deathsByCat: deaths.cat,
      meanNutrition: Math.round(mean * 100) / 100,
      judged,
      fallbacks,
    })
  }

  function frameNow(): Frame {
    const w = engine?.world()
    return {
      tick,
      population: w?.mice.length ?? 0,
      mice: (w?.mice ?? []).map((m) => ({
        id: m.id, x: m.at.x, y: m.at.y, nutrition: Math.round(m.nutrition),
        intent: m.intent, fear: m.fear, inHole: m.inHole !== null,
        hungry: hungerBand(m.nutrition) !== 'fed',
      })),
      cats: (w?.cats ?? []).map((c) => ({
        id: c.id, x: c.at.x, y: c.at.y, mode: c.mode,
        nutrition: Math.round(c.nutrition), hungry: c.hungry,
      })),
      food: (w?.food ?? []).filter((f) => f.present).map((f) => ({ id: f.id, x: f.at.x, y: f.at.y })),
      traps: (w?.traps ?? []).map((t) => ({
        id: t.id, x: t.at.x, y: t.at.y, occupied: t.occupantId !== null })),
      holes: (w?.holes ?? []).map((h) => ({
        id: h.id, x: h.at.x, y: h.at.y, occupancy: h.occupancy })),
    }
  }

  let lastFrameFlush = 0

  async function flushFrames(): Promise<void> {
    lastFrameFlush = now()
    if (pendingFrames.length === 0 && pendingLog.length === 0) return
    const batch = pendingFrames
    const log = pendingLog
    pendingFrames = []
    pendingLog = []
    await opts.coordinator.frames(batch, log)
  }

  /**
   * Strict order: the chunk, then the summary, then the snapshot, then the
   * report. A crash before the report leaves objects behind; a crash after it
   * leaves a consistent record. The other way round would lose events.
   */
  async function closeChunk(): Promise<void> {
    if (presigned === null) throw new Error('no upload grant')
    const chunkBody: ChunkBody = {
      runId: opts.runId, seq: chunkSeq, firstTick: chunkFirstTick, lastTick: tick,
      events: buffered,
    }
    const summaryBody: SummaryBody = { runId: opts.runId, seq: chunkSeq, points }
    const snapshot = engine?.serialize() ?? { version: 1 as const, tick }

    const chunk = encode(chunkBody)
    const summary = encode(summaryBody)
    const snap = encode(snapshot)

    await opts.upload(presigned.chunk, chunk.gzip)
    await opts.upload(presigned.summary, summary.gzip)
    await opts.upload(presigned.snapshot, snap.gzip)

    totals.currentTick = tick
    totals.requests += sinceChunk.requests
    totals.inputTokens += sinceChunk.inputTokens
    totals.fallbackCount += sinceChunk.fallbacks

    const report: ChunkReport = {
      seq: chunkSeq,
      firstTick: chunkFirstTick,
      lastTick: tick,
      eventCount: buffered.length,
      bytesRaw: chunk.raw,
      bytesGzip: chunk.gzip.byteLength,
      usage: { ...sinceChunk },
      totals: snapshotTotals(),
    }
    const ack = await opts.coordinator.chunk(report)

    chunkSeq += 1
    chunkFirstTick = tick + 1
    buffered = []
    bufferedBytes = 0
    points = []
    sinceChunk = { requests: 0, inputTokens: 0, fallbacks: 0, model: null }
    applyAck(ack)
  }

  function snapshotTotals(): ChunkReport['totals'] {
    return {
      ...totals,
      population: {
        mice: { ...totals.population.mice },
        cats: { ...totals.population.cats },
      },
    }
  }

  async function loop(): Promise<void> {
    const limit = opts.config.ticks
    let sinceYield = 0
    // Ticks earned but not yet spent. Elapsed wall time buys ticks at the
    // requested rate, which paces accurately without sleeping once per tick.
    let credit = 0
    let lastPaced = now()
    let holding = false

    while (tick < limit && control.desired !== 'stop') {
      if (control.desired === 'pause' && stepsOwed === 0) {
        if (!holding) {
          // One frame on the way in, so the page shows where it actually
          // stopped rather than wherever the last interval happened to land.
          holding = true
          pendingFrames.push(frameNow())
        }
        await flushFrames()
        // The clock is reset on the way out of a pause, so a long pause does
        // not bank ticks and spend them in a burst when the run resumes.
        credit = 0
        lastPaced = now()
        await sleep(5)
        continue
      }
      holding = false
      let stepped = false
      if (stepsOwed > 0) {
        stepsOwed -= 1
        stepped = true
        credit = 0
        lastPaced = now()
      } else if (control.speed > 0) {
        const at = now()
        credit += ((at - lastPaced) * control.speed) / 1000
        lastPaced = at
        if (credit < 1) {
          await sleep(PACE_NAP_MS)
          continue
        }
        credit -= 1
        // One second's worth is the most that may be owed, so a stall does not
        // turn into a sprint once the loop gets going again.
        credit = Math.min(credit, control.speed)
      }

      await engine?.step()
      tick += 1
      // Drained, not sliced. Slicing from a remembered index left the engine
      // holding every event of the run: 335,880 events and 136MB after 3,000
      // ticks, projecting to roughly 847MB over a full-length run.
      const fresh = engine?.drain() ?? []

      accumulate(fresh)
      logFrom(fresh, tick)
      for (const e of fresh) {
        if (e.kind === 'run_ended' && e.reason === 'extinct') engineEnded = 'extinct'
        else if (e.kind === 'run_ended') engineEnded = 'completed'
      }
      summarize(fresh, tick)
      buffered.push(...fresh)
      bufferedBytes += fresh.length * 200

      const every = control.speed > 0
        ? Math.max(1, Math.round(control.speed / FRAMES_PER_SECOND))
        : FRAME_EVERY_TICKS
      // A stepped turn always sends its frame: a step exists so that someone
      // can look at the result, and the interval would usually swallow it.
      if (stepped || tick % every === 0) pendingFrames.push(frameNow())
      const waiting = pendingFrames.length + pendingLog.length
      if (stepped || pendingFrames.length >= FRAME_BATCH
          || (waiting > 0 && now() - lastFrameFlush >= FRAME_FLUSH_MS)) {
        await flushFrames()
      }

      if (tick - chunkFirstTick + 1 >= CHUNK_TICKS || bufferedBytes >= CHUNK_BYTES) {
        await flushFrames()
        await closeChunk()
      }

      if (++sinceYield >= YIELD_EVERY_TICKS) {
        sinceYield = 0
        await sleep(0)
      }
      // The engine stops itself when nothing is left alive. Without this the
      // loop would step an empty world until the configured turn count.
      if (engineEnded !== null) break
    }
  }

  return {
    currentTick: () => tick,

    control(c) {
      // A command already seen is ignored, so a retried push cannot rewind.
      if (c.seq <= control.seq) return
      if (c.desired === 'step') {
        // A step is one tick out of a pause and then a pause again, so two
        // steps advance two ticks rather than releasing the run.
        control = { ...c, desired: 'pause' }
        stepsOwed += 1
        return
      }
      control = c
    },

    async start(o = {}) {
      try {
        if (o.snapshot) {
          engine = restore(o.snapshot, { provider: forwarding })
          tick = engine.world().tick
          chunkFirstTick = tick + 1
        } else {
          engine = createEngine({ config: opts.config, seed: opts.seed, provider: forwarding })
          chunkFirstTick = 1
        }
        opts.onEngine?.(engine)
        totals.currentTick = tick
        // Sampled before the first tick, or the population a run started with
        // would never appear in its own extremes.
        const opening = engine.world()
        totals.population.mice = extent(opening.mice.length)
        totals.population.cats = extent(opening.cats.length)

        applyAck(await opts.coordinator.ready({
          engineVersion: ENGINE_VERSION,
          pid: typeof process === 'undefined' ? 0 : process.pid,
          ...(o.snapshot ? { resumedFromTick: tick } : {}),
        }))

        await loop()
        // The run's last state is its last frame, whatever the interval was
        // due to send. Without this a finished run showed one turn and
        // reported another.
        pendingFrames.push(frameNow())
        await flushFrames()
        if (buffered.length > 0 || points.length > 0) await closeChunk()
        await opts.coordinator.done({
          finalTick: tick,
          totals: snapshotTotals(),
          reason: engineEnded ?? (control.desired === 'stop' ? 'stopped' : 'completed'),
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        await opts.coordinator.failed({ atTick: tick, reason })
      }
    },
  }
}
