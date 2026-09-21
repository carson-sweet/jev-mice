// The simulation process. It owns the loop, closes chunks, uploads what it
// produced through URLs it was handed, and reports sizes rather than keys, so
// it can neither name nor reach an object it was not given.

import {
  createEngine, restore, ENGINE_VERSION, hungerBand, narrate, situationLine,
  CHANGES_POPULATION,
  type Engine, type SimEvent,
} from '@jev-mice/engine'
import type {
  Advanced, Allowance, ChunkAck, ChunkBody, ChunkReport, Control,
  EndReason, Extent, Frame, LogEntry, Simulation, SimulationOptions, SummaryBody,
  SummaryPoint,
} from './types.js'
import type { DecisionLine } from './protocol.js'

export * from './types.js'
export * from './protocol.js'

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
/** Decisions carried on one flush. A busy turn makes more than anyone can read. */
export const DECISION_BATCH = 12
/** Which log kind each event becomes, for the mark shown beside the line. */
const KIND_OF: Partial<Record<SimEvent['kind'], LogEntry['kind']>> = {
  death: 'starved',
  capture: 'eaten',
  mouse_trapped: 'trapped',
  birth: 'born',
  mating: 'mated',
  cat_died: 'cat_starved',
  cap_limited_birth: 'birth_lost',
}

/** How often the loop returns to the event queue so a pushed control lands. */
const YIELD_EVERY_TICKS = 8
/** How long the loop naps when it is ahead of the pace it was asked for. */
const PACE_NAP_MS = 4

const utf8 = new TextEncoder()

/**
 * Gzip through the web stream, which both Node and the Workers runtime have.
 * node:zlib would have been simpler and synchronous, but the loop now runs
 * inside a Durable Object as well, where it does not exist.
 */
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes); c.close() },
  })
  // Cast because Node and the Workers runtime declare the stream's element type
  // differently and neither declaration is the one in this project's lib set.
  // Only the bytes crossing it matter, and the test gunzips them.
  const gz = new CompressionStream('gzip') as unknown as
    ReadableWritablePair<Uint8Array, Uint8Array>
  return new Uint8Array(await new Response(source.pipeThrough(gz)).arrayBuffer())
}

/**
 * Whether this turn should be drawn for whoever is watching.
 *
 * The tick interval on its own is not enough, and that was the bug. It is
 * derived from the speed the run was asked for, and a run does not always
 * achieve it: with Jev deciding, a run manages a few ticks a second, so an
 * interval of seventeen ticks meant five to eight seconds of a frozen picture.
 * Turning the speed up made the viewer slower while the run went no faster.
 *
 * Elapsed time is the backstop, so the cadence follows the speed the run is
 * really going rather than the speed it was asked to go.
 */
export function dueForFrame(o: {
  tick: number
  /** Ticks between frames, from the requested speed. */
  every: number
  /** A step always draws: it exists so someone can look at the result. */
  stepped: boolean
  msSinceLastFrame: number
}): boolean {
  if (o.stepped) return true
  if (o.every > 0 && o.tick % o.every === 0) return true
  return o.msSinceLastFrame >= 1000 / FRAMES_PER_SECOND
}

const encode = async (v: unknown): Promise<{ raw: number; gzip: Uint8Array }> => {
  const bytes = utf8.encode(JSON.stringify(v))
  return { raw: bytes.byteLength, gzip: await gzip(bytes) }
}

/**
 * The process this run is in, where there is one. Reached through globalThis
 * rather than the bare name so the module type-checks against the Workers
 * runtime, which has no node types and, inside a Durable Object, no process.
 */
const processId = (): number =>
  (globalThis as { process?: { pid?: number } }).process?.pid ?? 0

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
  /**
   * Decisions waiting to go to whoever is watching. Capped per flush: a busy
   * turn can produce twenty batches, and the tab is for reading rather than for
   * completeness. The stored record keeps every one of them.
   */
  let pendingDecisions: DecisionLine[] = []
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

  /**
   * Only what changes the population, phrased by the engine's own narrator so
   * the live log and the turn history cannot say the same event differently.
   */
  /**
   * The decisions log. Only mice: a cat's state has none of the fields the
   * summary reads, and its answer is a target rather than a drive.
   */
  function decisionsFrom(events: readonly SimEvent[], atTick: number): void {
    for (const e of events) {
      if (e.kind === 'decision_fallback') {
        pendingDecisions.push({
          seq: e.seq, tick: atTick, source: 'baseline', latencyMs: 0,
          fallback: e.reason, subjects: [],
        })
        continue
      }
      if (e.kind !== 'decision_returned') continue
      pendingDecisions.push({
        seq: e.seq,
        tick: atTick,
        source: e.source,
        latencyMs: e.latencyMs,
        ...(e.model === undefined ? {} : { model: e.model }),
        ...(e.inputTokens === undefined ? {} : { inputTokens: e.inputTokens }),
        subjects: e.subjects
          .filter((s) => s.agentId.startsWith('m'))
          .map((s) => ({
            agentId: s.agentId,
            situation: situationLine(s.state),
            intent: s.intent,
            fear: s.fear,
            confidence: Math.round(((s.answers['drive'] as { confidence?: number } | undefined)
              ?.confidence ?? 0) * 100) / 100,
          })),
      })
    }
    if (pendingDecisions.length > DECISION_BATCH) {
      pendingDecisions = pendingDecisions.slice(-DECISION_BATCH)
    }
  }

  function logFrom(events: readonly SimEvent[], atTick: number): void {
    for (const e of events) {
      if (!CHANGES_POPULATION.has(e.kind)) continue
      // A cat kill and a trap death are named by the events that carry the cat
      // or the trap, so the bare death event is skipped for those.
      if (e.kind === 'death' && e.cause !== 'starvation') continue
      const said = narrate(e)
      const d = said.subject === undefined ? undefined : lastDecision.get(said.subject)
      pendingLog.push({
        seq: e.seq,
        tick: atTick,
        kind: KIND_OF[e.kind] ?? 'starved',
        subject: said.subject ?? '',
        text: said.text,
        ...(d === undefined ? {} : { decision: d.intent, decidedBy: d.source }),
      })
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
        hungry: hungerBand(m.nutrition) !== 'fed', infected: m.infected,
      })),
      cats: (w?.cats ?? []).map((c) => ({
        id: c.id, x: c.at.x, y: c.at.y, mode: c.mode,
        nutrition: Math.round(c.nutrition), hungry: c.hungry, shedding: c.shedding,
      })),
      food: (w?.food ?? []).filter((f) => f.present)
        .map((f) => ({ id: f.id, x: f.at.x, y: f.at.y, contaminated: f.contaminated })),
      traps: (w?.traps ?? []).map((t) => ({
        id: t.id, x: t.at.x, y: t.at.y, occupied: t.occupantId !== null })),
      holes: (w?.holes ?? []).map((h) => ({
        id: h.id, x: h.at.x, y: h.at.y, occupancy: h.occupancy })),
    }
  }

  let lastFrameFlush = 0
  /** When a frame was last taken, as distinct from when one was last sent. */
  let lastFrameAt = 0

  async function flushFrames(): Promise<void> {
    lastFrameFlush = now()
    if (pendingFrames.length === 0 && pendingLog.length === 0
        && pendingDecisions.length === 0) return
    const batch = pendingFrames
    const log = pendingLog
    const decisions = pendingDecisions
    pendingFrames = []
    pendingLog = []
    pendingDecisions = []
    await opts.coordinator.frames(batch, log, decisions)
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

    // Named rather than destructured from an array, because the three are not
    // interchangeable and a mis-ordered upload would put a snapshot where a
    // chunk belongs.
    const chunk = await encode(chunkBody)
    const summary = await encode(summaryBody)
    const snap = await encode(snapshot)

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

  /** The run's own end, as distinct from a batch ceiling. */
  const limit = opts.config.ticks

  async function loop(ceiling: number): Promise<void> {
    let sinceYield = 0
    // Ticks earned but not yet spent. Elapsed wall time buys ticks at the
    // requested rate, which paces accurately without sleeping once per tick.
    let credit = 0
    let lastPaced = now()
    let holding = false

    while (tick < limit && tick < ceiling && control.desired !== 'stop') {
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
      decisionsFrom(fresh, tick)
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
      if (dueForFrame({ tick, every, stepped, msSinceLastFrame: now() - lastFrameAt })) {
        pendingFrames.push(frameNow())
        lastFrameAt = now()
      }
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
      const ceiling = o.until ?? Number.POSITIVE_INFINITY
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
        // Carried over when resuming. A fresh simulation counts from zero, and
        // a run advanced in batches would then report only its last batch: the
        // deployment showed a lowest population of 62 where the same seed in
        // one pass had dipped to 45, and every Jev request before the final
        // batch went uncounted.
        if (o.totals) {
          totals.requests = o.totals.requests
          totals.inputTokens = o.totals.inputTokens
          totals.fallbackCount = o.totals.fallbackCount
          totals.population = {
            mice: { ...o.totals.population.mice },
            cats: { ...o.totals.population.cats },
          }
        }
        totals.currentTick = tick
        // Sampled before the first tick, or the population a run started with
        // would never appear in its own extremes. Widened rather than replaced
        // when resuming, so the earlier batches' extremes survive.
        const opening = engine.world()
        if (o.totals) {
          widen(totals.population.mice, opening.mice.length)
          widen(totals.population.cats, opening.cats.length)
        } else {
          totals.population.mice = extent(opening.mice.length)
          totals.population.cats = extent(opening.cats.length)
        }

        applyAck(await opts.coordinator.ready({
          engineVersion: ENGINE_VERSION,
          pid: processId(),
          ...(o.snapshot ? { resumedFromTick: tick } : {}),
        }))

        await loop(ceiling)
        // The run's last state is its last frame, whatever the interval was
        // due to send. Without this a finished run showed one turn and
        // reported another.
        pendingFrames.push(frameNow())
        await flushFrames()
        if (buffered.length > 0 || points.length > 0) await closeChunk()

        // Stopped on the ceiling with the run still going. The chunk above
        // carried the snapshot, so the next call picks up from there. Reporting
        // done here would archive a run that is only part way through.
        if (tick < limit && control.desired !== 'stop' && engineEnded === null) {
          return { finished: false, tick }
        }

        await opts.coordinator.done({
          finalTick: tick,
          totals: snapshotTotals(),
          reason: engineEnded ?? (control.desired === 'stop' ? 'stopped' : 'completed'),
        })
        return { finished: true, tick }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        await opts.coordinator.failed({ atTick: tick, reason })
        return { finished: true, tick }
      }
    },
  }
}
