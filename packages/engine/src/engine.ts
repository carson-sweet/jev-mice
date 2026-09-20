// The simulation. One fixed tick order, every loop in ascending id order, every
// draw from one injected generator. Nothing here reads a clock, reaches a
// network, or touches a page: that is what makes a run replayable.

import type {
  AgentId, CandidateScore, Cell, DecisionBatch, DecisionProvider, DecisionRequest,
  DecisionSubject, Drive, FearLevel, HungerBand, Memory, Personality, RunConfig, Sex,
  SimEvent, Snapshot, Spottable, Tick, WorldView,
} from './types.js'
import {
  ALARM_RANGE, BATCH_SIZE, CAT, catBand, DRIVES, ENGINE_VERSION, hungerBand, JITTER,
  NUTRITION_BANDS,
  PERCEPTION, PERSONALITIES, PUP_NUTRITION, TIMING,
} from './types.js'
import { capsFor, drawPersonality, PRESETS } from './config.js'
import { createRng, type Rng, type RngState } from './rng.js'
import {
  addMemory, bearingFrom, expireMemories, freshestSeen, sentenceFor,
} from './memory.js'
import {
  chebyshev, dangerAt, exploreAt, foodAt, mateAt, NEIGHBOURS, normalize,
  shelterAt, type Sources,
} from './signals.js'
import {
  composeRequests, contextFor, baselineDrive, baselineFear, baselineBatch,
} from './decisions.js'

const DECISION_TIMEOUT_MS = 2000

interface MouseState {
  id: AgentId; sex: Sex; personality: Personality
  nutrition: number; age: Tick; x: number; y: number
  inHole: string | null
  intent: Drive | null; intentSetAt: Tick
  fear: FearLevel
  weights: Record<string, number>
  memories: Memory[]
  pregnantSince: Tick | null
  nextMoveTick: Tick
  busyUntil: Tick
  busyWith: 'eat' | 'mate' | 'birth' | null
  eatingFoodId: string | null
  mateTarget: AgentId | null
  isPup: boolean
  recent: Cell[]
  alarmedAt: Record<AgentId, Tick>
  decidedAt: Tick
  band: HungerBand
  /** Ids currently in perception, sorted. Diffed each tick to find arrivals. */
  seen: string[]
}

interface CatState {
  id: AgentId; x: number; y: number
  mode: 'prowl' | 'stalk' | 'pounce' | 'rest' | 'eating'
  target: AgentId | null
  pounceCooldown: number; patience: number
  lastSighting: Cell | null; sightingUntil: Tick
  busyUntil: Tick
  nutrition: number
  band: 'fed' | 'hungry'
  seen: string[]
  bestDistance: number
  drift: { dx: number; dy: number }
}

interface FoodState { id: string; x: number; y: number; present: boolean; respawnAt: Tick }
interface TrapState { id: string; x: number; y: number; occupantId: AgentId | null; respawnAt: Tick }
interface HoleState { id: string; x: number; y: number; adult: AgentId | null; brood: AgentId[] }

export interface EngineOptions {
  config: RunConfig
  seed: number
  provider: DecisionProvider
}

export interface Engine {
  step(): Promise<void>
  run(ticks: number): Promise<void>
  world(): WorldView
  events(): readonly SimEvent[]
  drain(): SimEvent[]
  serialize(): Snapshot
  candidateScores(id: AgentId): CandidateScore[]
  /** Test seam: force a fear level so the danger gradient can be inspected. */
  setFear(id: AgentId, fear: FearLevel): void
  /** Test seam: how long an intent is held at a given fear level. */
  intentHoldFor(fear: FearLevel): number
}

const pad = (n: number): string => String(n).padStart(4, '0')

export function createEngine(o: EngineOptions): Engine {
  return build(o.config, o.seed, o.provider, null)
}

export function restore(snap: Snapshot, o: { provider: DecisionProvider }): Engine {
  const s = snap as unknown as SerializedState
  if (s.version !== 1) throw new Error(`unsupported snapshot version ${String(s.version)}`)
  return build(s.config, s.seed, o.provider, s)
}

interface SerializedState {
  version: 1; tick: Tick; seq: number; seed: number; engineVersion: string
  config: RunConfig; rng: RngState
  mice: MouseState[]; cats: CatState[]
  food: FoodState[]; traps: TrapState[]; holes: HoleState[]
  nextMouse: number; ended: boolean; batchNo: number
}

function build(
  config: RunConfig, seed: number, provider: DecisionProvider, from: SerializedState | null,
): Engine {
  const { width, height } = PRESETS[config.preset]
  const caps = capsFor(config.preset)
  const rng: Rng = createRng(seed)

  let tick: Tick = 0
  let seq = 0
  let nextMouse = 1
  let batchNo = 0
  let ended = false
  let buffer: SimEvent[] = []

  let mice: MouseState[] = []
  let cats: CatState[] = []
  let food: FoodState[] = []
  let traps: TrapState[] = []
  let holes: HoleState[] = []

  const emit = (e: Omit<SimEvent, 'tick' | 'seq'>): void => {
    buffer.push({ ...(e as object), tick, seq: seq++ } as SimEvent)
  }

  // ------------------------------------------------------------------ setup

  const occupiedByAnimal = (x: number, y: number): boolean =>
    mice.some((m) => !m.inHole && m.x === x && m.y === y) || cats.some((c) => c.x === x && c.y === y)

  const freeCell = (avoid: (x: number, y: number) => boolean): Cell => {
    for (let attempt = 0; attempt < 4000; attempt++) {
      const x = rng.int(width), y = rng.int(height)
      if (!avoid(x, y)) return { x, y }
    }
    return { x: rng.int(width), y: rng.int(height) }
  }

  const hasHole = (x: number, y: number) => holes.some((h) => h.x === x && h.y === y)
  const hasFood = (x: number, y: number) => food.some((f) => f.x === x && f.y === y)
  const hasTrap = (x: number, y: number) => traps.some((t) => t.x === x && t.y === y)

  if (from) {
    tick = from.tick; seq = from.seq; nextMouse = from.nextMouse; ended = from.ended
    batchNo = from.batchNo
    mice = from.mice.map((m) => ({ ...m, memories: m.memories.map((x) => ({ ...x })),
      recent: m.recent.map((c) => ({ ...c })), alarmedAt: { ...m.alarmedAt },
      seen: [...m.seen], weights: { ...m.weights } }))
    cats = from.cats.map((c) => ({ ...c, lastSighting: c.lastSighting ? { ...c.lastSighting } : null,
      seen: [...c.seen], drift: { ...c.drift } }))
    food = from.food.map((f) => ({ ...f }))
    traps = from.traps.map((t) => ({ ...t }))
    holes = from.holes.map((h) => ({ ...h, brood: [...h.brood] }))
    rng.restore(from.rng)
    // No event is emitted here. A resume is a fact about the process, not about
    // the simulation, and emitting it made a resumed stream differ from a
    // straight one for the same ticks. The coordinator records the restart.
  } else {
    for (let i = 0; i < Math.min(config.mouseholes, caps.mouseholes); i++) {
      const c = freeCell((x, y) => hasHole(x, y))
      holes.push({ id: `h${pad(i + 1)}`, x: c.x, y: c.y, adult: null, brood: [] })
    }
    for (let i = 0; i < Math.min(config.foodPiles, caps.food); i++) {
      const c = freeCell((x, y) => hasHole(x, y) || hasFood(x, y))
      food.push({ id: `f${pad(i + 1)}`, x: c.x, y: c.y, present: true, respawnAt: 0 })
    }
    for (let i = 0; i < Math.min(config.traps, caps.traps); i++) {
      const c = freeCell((x, y) => hasHole(x, y) || hasFood(x, y) || hasTrap(x, y))
      traps.push({ id: `t${pad(i + 1)}`, x: c.x, y: c.y, occupantId: null, respawnAt: 0 })
    }
    emit({ kind: 'run_started', config, seed, engineVersion: ENGINE_VERSION } as never)
    const start = config.startingNutrition ?? 100
    const wanted = Math.min(config.maleMice + config.femaleMice, caps.mice)
    for (let i = 0; i < wanted; i++) {
      const sex: Sex = i < Math.min(config.maleMice, wanted) ? 'male' : 'female'
      const personality = drawPersonality(config, rng.next())
      const c = freeCell((x, y) => hasHole(x, y) || hasTrap(x, y) || occupiedByAnimal(x, y))
      const m = newMouse(`m${pad(nextMouse++)}`, sex, personality, c, start, false)
      mice.push(m)
      emit({ kind: 'mouse_spawned', id: m.id, sex, personality } as never)
    }
    for (let i = 0; i < Math.min(config.cats, caps.cats); i++) {
      const c = freeCell((x, y) => hasHole(x, y) || occupiedByAnimal(x, y))
      cats.push({ id: `c${pad(i + 1)}`, x: c.x, y: c.y, mode: 'prowl', target: null,
        nutrition: CAT.startingNutrition, band: 'fed', seen: [],
        pounceCooldown: 0, patience: 0, lastSighting: null, sightingUntil: 0,
        busyUntil: 0, bestDistance: Infinity, drift: { dx: 0, dy: 0 } })
    }
  }

  function newMouse(
    id: AgentId, sex: Sex, personality: Personality, at: Cell, nutrition: number, isPup: boolean,
  ): MouseState {
    return {
      id, sex, personality, nutrition, age: 0, x: at.x, y: at.y,
      inHole: null, intent: null, intentSetAt: -TIMING.intentHold, fear: 'unconcerned',
      weights: {}, memories: [], pregnantSince: null,
      nextMoveTick: 0, busyUntil: 0, busyWith: null, eatingFoodId: null,
      mateTarget: null, isPup, recent: [{ ...at }], alarmedAt: {}, decidedAt: -9999,
      band: hungerBand(nutrition), seen: [],
    }
  }

  // -------------------------------------------------------------- perception

  const perceptionOf = (m: MouseState): number =>
    m.personality === 'vigilant' ? PERCEPTION.vigilantMouse : PERCEPTION.mouse

  const knowsTrap = (m: MouseState, t: TrapState): boolean =>
    t.occupantId !== null && chebyshev({ x: m.x, y: m.y }, { x: t.x, y: t.y }) <= perceptionOf(m)
    || m.memories.some((mem) => mem.at.x === t.x && mem.at.y === t.y)

  // Rebuilt once per tick rather than once per mouse. Doing it per mouse made
  // the whole loop quadratic in population and a full-cap run crawl.
  let cache = { tick: -1, food: [] as Cell[], liveTraps: [] as { at: Cell; id: string }[],
                cats: [] as Cell[], holes: [] as Cell[], adults: [] as MouseState[] }

  function refreshCache(): void {
    if (cache.tick === tick) return
    cache = {
      tick,
      food: food.filter((f) => f.present).map((f) => ({ x: f.x, y: f.y })),
      liveTraps: traps.filter((x) => x.occupantId === null).map((x) => ({ at: { x: x.x, y: x.y }, id: x.id })),
      cats: cats.map((c) => ({ x: c.x, y: c.y })),
      holes: holes.filter((h) => h.adult === null && h.brood.length === 0).map((h) => ({ x: h.x, y: h.y })),
      adults: mice.filter((o) => !o.inHole && o.age >= TIMING.juvenile),
    }
  }

  function sourcesFor(m: MouseState): Sources {
    refreshCache()
    const here = { x: m.x, y: m.y }
    const r = perceptionOf(m)
    const known: Cell[] = []
    const suspect: Cell[] = []
    for (const t2 of cache.liveTraps) {
      const remembered = m.memories.some((mem) => mem.at.x === t2.at.x && mem.at.y === t2.at.y)
      ;(remembered ? known : suspect).push(t2.at)
    }
    for (const t2 of traps) {
      // a corpse still in a trap is visible danger to anyone who can see it
      if (t2.occupantId !== null && chebyshev(here, { x: t2.x, y: t2.y }) <= r) {
        known.push({ x: t2.x, y: t2.y })
      }
    }
    return {
      food: cache.food,
      suspectFood: suspect,
      knownTraps: known,
      cats: cache.cats.filter((c) => chebyshev(here, c) <= r),
      mates: cache.adults.filter((o) => o.id !== m.id && o.sex !== m.sex
        && chebyshev(here, { x: o.x, y: o.y }) <= r).map((o) => ({ x: o.x, y: o.y })),
      shelter: cache.holes,
    }
  }

  function scoresFor(m: MouseState): CandidateScore[] {
    const here = { x: m.x, y: m.y }
    const s = sourcesFor(m)
    const cells = NEIGHBOURS.map((n) => ({ x: here.x + n.dx, y: here.y + n.dy }))
      .filter((c) => c.x >= 0 && c.x < width && c.y >= 0 && c.y < height)
    const raw = cells.map((c) => ({
      cell: c,
      danger: dangerAt(c, s, m.fear),
      food: foodAt(c, s),
      shelter: shelterAt(c, s),
      mate: mateAt(c, s),
      explore: exploreAt(c, here, m.recent),
    }))
    const nd = normalize(raw.map((r) => r.danger))
    const nf = normalize(raw.map((r) => r.food))
    const ns = normalize(raw.map((r) => r.shelter))
    const nm = normalize(raw.map((r) => r.mate))
    const ne = normalize(raw.map((r) => r.explore))
    const w = m.weights
    return raw.map((r, i) => {
      const danger = nd[i] ?? 0, fd = nf[i] ?? 0, sh = ns[i] ?? 0, mt = nm[i] ?? 0, ex = ne[i] ?? 0
      const total =
        (w['eat'] ?? 0) * fd
        - (w['flee'] ?? 0) * danger
        + ((w['hide'] ?? 0) + (w['nest'] ?? 0)) * sh
        + (w['seek_mate'] ?? 0) * mt
        + (w['explore'] ?? 0) * ex
      return { cell: r.cell, danger, food: fd, shelter: sh, mate: mt, explore: ex, total }
    })
  }

  // ------------------------------------------------------------------ timers

  function resolveTimers(): void {
    for (const f of food) {
      if (!f.present && f.respawnAt > 0 && tick >= f.respawnAt) {
        const c = freeCell((x, y) => hasHole(x, y) || hasFood(x, y) || hasTrap(x, y))
        f.x = c.x; f.y = c.y; f.present = true; f.respawnAt = 0
        emit({ kind: 'food_respawned', foodId: f.id, at: { x: f.x, y: f.y } } as never)
      }
    }
    for (const t of traps) {
      if (t.occupantId !== null && tick >= t.respawnAt) {
        const c = freeCell((x, y) => hasHole(x, y) || hasFood(x, y) || hasTrap(x, y)
          || mice.some((m) => !m.inHole && chebyshev({ x, y }, { x: m.x, y: m.y }) < 5))
        t.x = c.x; t.y = c.y; t.occupantId = null; t.respawnAt = 0
        emit({ kind: 'trap_respawned', trapId: t.id, at: { x: t.x, y: t.y } } as never)
      }
    }
    for (const c of cats) {
      if (c.pounceCooldown > 0) c.pounceCooldown--
      if (c.mode === 'eating' && tick >= c.busyUntil) {
        c.mode = 'rest'; c.target = null; c.bestDistance = Infinity
        // resuming next tick, not this one: the tick it stops eating is spent finishing
        c.busyUntil = tick + 1
        emit({ kind: 'cat_eating_ended', id: c.id } as never)
      }
      if (c.mode === 'rest' && tick >= c.busyUntil) c.mode = 'prowl'
    }
    for (const m of mice) m.memories = expireMemories(m.memories, tick)
  }

  // ------------------------------------------------------------- the tick

  async function advance(): Promise<void> {
    if (ended) return
    tick++

    resolveTimers()

    // nutrition, age, death by starvation
    for (const m of [...mice]) {
      m.age++
      m.nutrition -= config.nutritionDecayPerTick
      if (m.nutrition <= 0) kill(m, 'starvation')
    }

    // pups leave shelter when hunger takes them below the fed band
    for (const h of holes) {
      if (h.brood.length === 0) continue
      const staying: AgentId[] = []
      for (const id of h.brood) {
        const pup = mice.find((m) => m.id === id)
        if (!pup) continue
        if (pup.nutrition < NUTRITION_BANDS.fed) {
          pup.inHole = null; pup.isPup = false
          emit({ kind: 'hole_left', id: pup.id, holeId: h.id } as never)
        } else staying.push(id)
      }
      h.brood = staying
      if (h.brood.length === 0) emit({ kind: 'hole_freed', holeId: h.id } as never)
    }
    // adults leave when hungry
    for (const m of mice) {
      if (!m.inHole || m.isPup) continue
      if (m.nutrition < NUTRITION_BANDS.fed) {
        const h = holes.find((x) => x.id === m.inHole)
        if (h) { h.adult = null; emit({ kind: 'hole_freed', holeId: h.id } as never) }
        emit({ kind: 'hole_left', id: m.id, holeId: m.inHole } as never)
        m.inHole = null
        m.intentSetAt = -TIMING.intentHold
      }
    }

    // reflexes preempt without a decision
    for (const m of sortedMice()) {
      if (m.inHole || m.busyWith === 'birth') continue
      const cat = cats.find((c) => chebyshev({ x: m.x, y: m.y }, { x: c.x, y: c.y }) <= 1)
      if (cat) { m.intent = 'flee'; m.intentSetAt = tick; m.weights = { flee: 1 }; m.busyWith = null; continue }
      const pile = food.find((f) => f.present && f.x === m.x && f.y === m.y)
      if (pile && m.nutrition < 100 && m.busyWith !== 'eat') {
        m.intent = 'eat'; m.intentSetAt = tick
        m.busyWith = 'eat'; m.busyUntil = tick + TIMING.eat; m.eatingFoodId = pile.id
      }
    }

    await decide()

    // movement, in ascending id order
    for (const m of sortedMice()) {
      if (m.inHole || m.busyWith !== null) continue
      if (tick < m.nextMoveTick) continue
      moveMouse(m)
    }
    for (const c of [...cats].sort(byId)) {
      if (c.mode === 'eating') continue
      moveCat(c)
    }

    // interactions
    finishEating()
    resolveTrapEntries()
    resolveCaptures()
    resolveCatHunger()
    resolveHoleEntries()
    resolveMating()
    resolveBirths()
    exchangeAlarms()
    // Last, so both read the world as the turn leaves it.
    resolveHungerBands()
    resolvePerception()

    emit({ kind: 'tick_advanced', population: mice.length } as never)

    if (tick >= config.ticks) {
      ended = true
      emit({ kind: 'run_ended', reason: 'completed', finalTick: tick } as never)
    }
  }

  const byId = (a: { id: string }, b: { id: string }): number =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  const sortedMice = (): MouseState[] => [...mice].sort(byId)

  // ---------------------------------------------------------------- decisions

  async function decide(): Promise<void> {
    const ready = sortedMice().filter((m) =>
      !m.inHole && m.busyWith === null &&
      tick - m.intentSetAt >= intentHold(m.fear)).map((m) => m.id)
    const readyCats = [...cats].sort(byId).filter((c) =>
      c.mode !== 'eating' && (c.target === null || !mice.some((m) => m.id === c.target))
      && mice.some((m) => !m.inHole
        && chebyshev({ x: m.x, y: m.y }, { x: c.x, y: c.y }) <= catPerception(c)))
      .map((c) => c.id)
    if (ready.length === 0 && readyCats.length === 0) return

    const view = world()
    const requests = composeRequests(view, [...ready, ...readyCats], () => `b${++batchNo}`)
    if (requests.length === 0) return
    for (const r of requests) emit({ kind: 'decision_requested', batchId: r.batchId, agents: r.agents } as never)

    let answers: Record<string, DecisionBatch> | null = null
    let failure: 'timeout' | 'error' | null = null
    try {
      answers = await withTimeout(provider.decide(requests), DECISION_TIMEOUT_MS)
    } catch (err) {
      failure = err instanceof TimeoutError ? 'timeout' : 'error'
    }

    if (!answers) {
      for (const r of requests) {
        emit({ kind: 'decision_fallback', batchId: r.batchId, reason: failure ?? 'error' } as never)
      }
      answers = applyLocalRules(requests)
    }

    // apply in ascending agent id order, never in arrival order
    for (const r of requests) {
      const batch = answers[r.batchId] ?? baselineBatch(r, tick)
      // A provider that chose the rules is not a fallback. Only one that meant
      // to ask and could not is, and it says so.
      if (!failure && batch.fallbackReason !== undefined) {
        emit({ kind: 'decision_fallback', batchId: r.batchId,
               reason: batch.fallbackReason } as never)
      }
      const subjects = batch.subjects.slice().sort((a, b) =>
        a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0)
      emit({ kind: 'decision_returned', batchId: r.batchId, source: batch.source,
             latencyMs: batch.latencyMs, model: batch.model,
             inputTokens: batch.inputTokens, subjects } as never)
      for (const s of subjects) applyDecision(s)
    }
  }

  function applyLocalRules(requests: readonly DecisionRequest[]):
      Record<string, DecisionBatch> {
    const out: Record<string, DecisionBatch> = {}
    for (const r of requests) out[r.batchId] = baselineBatch(r, tick)
    return out
  }

  function applyDecision(s: DecisionSubject): void {
    const m = mice.find((x) => x.id === s.agentId)
    if (m) {
      // A cat's mode can never become a mouse's intent, whatever a provider returns.
      m.intent = (DRIVES as readonly string[]).includes(s.intent) ? s.intent as Drive : 'explore'
      m.intentSetAt = tick; m.weights = s.weights
      m.fear = s.fear; m.decidedAt = tick
      return
    }
    const c = cats.find((x) => x.id === s.agentId)
    if (c) {
      const visible = mice.filter((x) => !x.inHole
        && chebyshev({ x: x.x, y: x.y }, { x: c.x, y: c.y }) <= PERCEPTION.cat)
      const best = visible.reduce<MouseState | null>((a, b) => {
        const score = (m2: MouseState) =>
          chebyshev({ x: m2.x, y: m2.y }, { x: c.x, y: c.y }) + m2.nutrition / 20
        return a === null || score(b) < score(a) ? b : a
      }, null)
      c.target = best?.id ?? null
      c.bestDistance = Infinity
      c.patience = 0
      c.mode = best ? 'stalk' : 'prowl'
      emit({ kind: 'cat_targeted', id: c.id, target: c.target, mode: c.mode } as never)
    }
  }

  const intentHold = (fear: FearLevel): number =>
    fear === 'panicked' ? TIMING.intentHoldPanicked : TIMING.intentHold

  // ---------------------------------------------------------------- movement

  function moveMouse(m: MouseState): void {
    const scores = scoresFor(m)
    const wantsHole = m.intent === 'hide' || m.intent === 'nest'
    let best: CandidateScore | null = null
    let bestValue = -Infinity
    for (const s of scores) {
      if (s.cell.x === m.x && s.cell.y === m.y) {
        const v = s.total + JITTER * rng.next()
        if (v > bestValue) { bestValue = v; best = s }
        continue
      }
      if (occupiedByAnimal(s.cell.x, s.cell.y)) continue
      if (cats.some((c) => c.x === s.cell.x && c.y === s.cell.y)) continue
      const hole = holes.find((h) => h.x === s.cell.x && h.y === s.cell.y)
      if (hole && !(wantsHole && hole.adult === null && hole.brood.length === 0)) continue
      const v = s.total + JITTER * rng.next()
      if (v > bestValue) { bestValue = v; best = s }
    }
    if (!best || (best.cell.x === m.x && best.cell.y === m.y)) {
      m.nextMoveTick = tick + moveCost(m); return
    }
    const from = { x: m.x, y: m.y }
    m.x = best.cell.x; m.y = best.cell.y
    m.recent.push({ x: m.x, y: m.y })
    if (m.recent.length > 8) m.recent.shift()
    m.nextMoveTick = tick + moveCost(m)
    emit({ kind: 'moved', id: m.id, from, to: { x: m.x, y: m.y } } as never)
  }

  const moveCost = (m: MouseState): number =>
    m.nutrition >= NUTRITION_BANDS.fed ? TIMING.moveFed
      : m.nutrition >= NUTRITION_BANDS.hungry ? TIMING.moveHungry : TIMING.moveStarving

  const isHungry = (c: CatState): boolean => c.nutrition < CAT.hungryBelow
  const catPerception = (c: CatState): number =>
    isHungry(c) ? CAT.perceptionHungry : CAT.perception
  const catPounceRange = (c: CatState): number =>
    isHungry(c) ? CAT.pounceRangeHungry : CAT.pounceRange
  const catPounceCooldown = (c: CatState): number =>
    isHungry(c) ? CAT.pounceCooldownHungry : CAT.pounceCooldown

  /**
   * Hunger, then departure. A cat that is not succeeding here leaves rather
   * than haunting an empty map forever, which is the only way a predator is
   * ever removed from a run.
   */
  function resolveCatHunger(): void {
    const leaving: CatState[] = []
    for (const c of [...cats].sort(byId)) {
      c.nutrition = Math.max(0, c.nutrition - CAT.decayPerTick)
      if (c.nutrition <= CAT.leaveAt) leaving.push(c)
    }
    for (const c of leaving) {
      emit({ kind: 'cat_left', id: c.id, reason: 'starving',
             nutrition: Math.round(c.nutrition * 100) / 100,
             at: { x: c.x, y: c.y } } as never)
      cats = cats.filter((o) => o.id !== c.id)
      // Nothing else needs unpicking: no mouse holds a cat's id, and a mouse
      // that was fleeing this one simply stops perceiving it and re-decides.
    }
  }

  function moveCat(c: CatState): void {
    // Covers the tick a meal ends and the rest that follows losing a target.
    if (tick < c.busyUntil) return
    const target = c.target ? mice.find((m) => m.id === c.target && !m.inHole) : undefined
    if (c.target && !target) {
      c.lastSighting = c.lastSighting ?? null
      c.sightingUntil = tick + TIMING.catReturnToSighting
      const restless = isHungry(c)
      c.target = null
      c.mode = restless ? 'prowl' : 'rest'
      if (!restless) c.busyUntil = tick + TIMING.catRest
      emit({ kind: 'cat_targeted', id: c.id, target: null, mode: c.mode } as never)
      return
    }
    if (target) {
      const d = chebyshev({ x: c.x, y: c.y }, { x: target.x, y: target.y })
      if (d < c.bestDistance) { c.bestDistance = d; c.patience = 0 } else c.patience++
      if (c.patience >= TIMING.catPatience) {
        c.lastSighting = { x: target.x, y: target.y }
        c.sightingUntil = tick + TIMING.catReturnToSighting
        c.target = null; c.mode = 'prowl'; c.bestDistance = Infinity; c.patience = 0
        emit({ kind: 'cat_targeted', id: c.id, target: null, mode: 'prowl' } as never)
        return
      }
      if (d <= catPounceRange(c) && c.pounceCooldown === 0) {
        const from = { x: c.x, y: c.y }
        stepToward(c, target.x, target.y, 2)
        c.pounceCooldown = catPounceCooldown(c)
        c.mode = 'pounce'
        emit({ kind: 'cat_pounced', id: c.id, target: target.id, from, to: { x: c.x, y: c.y } } as never)
        return
      }
      c.mode = 'stalk'
      c.lastSighting = { x: target.x, y: target.y }
      stepToward(c, target.x, target.y, 1)
      return
    }
    if (c.mode === 'rest') return
    if (c.lastSighting && tick < c.sightingUntil) {
      stepToward(c, c.lastSighting.x, c.lastSighting.y, 1)
      if (c.x === c.lastSighting.x && c.y === c.lastSighting.y) c.lastSighting = null
      return
    }
    // a random walk with momentum
    if (c.drift.dx === 0 && c.drift.dy === 0 || rng.next() < 0.1) {
      c.drift = { dx: rng.int(3) - 1, dy: rng.int(3) - 1 }
    }
    stepToward(c, c.x + c.drift.dx * 3, c.y + c.drift.dy * 3, 1)
    c.mode = 'prowl'
  }

  function stepToward(c: CatState, tx: number, ty: number, steps: number): void {
    for (let i = 0; i < steps; i++) {
      const dx = Math.sign(tx - c.x), dy = Math.sign(ty - c.y)
      const nx = Math.max(0, Math.min(width - 1, c.x + dx))
      const ny = Math.max(0, Math.min(height - 1, c.y + dy))
      if (nx === c.x && ny === c.y) return
      if (holes.some((h) => h.x === nx && h.y === ny)) return
      if (cats.some((o) => o.id !== c.id && o.x === nx && o.y === ny)) return
      const from = { x: c.x, y: c.y }
      c.x = nx; c.y = ny
      emit({ kind: 'moved', id: c.id, from, to: { x: c.x, y: c.y } } as never)
    }
  }

  // ------------------------------------------------------------ interactions

  function finishEating(): void {
    for (const m of sortedMice()) {
      if (m.busyWith !== 'eat' || tick < m.busyUntil) continue
      const pile = food.find((f) => f.id === m.eatingFoodId)
      m.busyWith = null; m.eatingFoodId = null
      if (!pile || !pile.present) continue
      pile.present = false
      pile.respawnAt = config.foodRespawnTicks > 0 ? tick + config.foodRespawnTicks : 0
      m.nutrition = 100
      emit({ kind: 'food_eaten', id: m.id, foodId: pile.id } as never)
    }
  }

  function resolveTrapEntries(): void {
    for (const m of sortedMice()) {
      if (m.inHole) continue
      const t = traps.find((x) => x.occupantId === null && x.x === m.x && x.y === m.y)
      if (!t) continue
      emit({ kind: 'trap_entered', id: m.id, trapId: t.id } as never)
      const chance = 0.5 * (m.nutrition / 100)
      const evaded = rng.next() < chance
      emit({ kind: 'evasion_rolled', id: m.id, trapId: t.id,
             nutrition: m.nutrition, chance, evaded } as never)
      if (evaded) {
        witness('narrow_escape', { x: t.x, y: t.y }, [m.id])
        continue
      }
      t.occupantId = m.id
      t.respawnAt = tick + TIMING.trapOccupied
      emit({ kind: 'mouse_trapped', id: m.id, trapId: t.id } as never)
      kill(m, 'trap', { x: t.x, y: t.y })
    }
  }

  /**
   * A band crossing, not a nutrition figure. Reported once per crossing, so a
   * turn shows that an animal became hungry rather than that it is hungry.
   */
  function resolveHungerBands(): void {
    for (const m of sortedMice()) {
      const now = hungerBand(m.nutrition)
      if (now === m.band) continue
      emit({ kind: 'hunger_changed', id: m.id, subject: 'mouse',
             from: m.band, to: now } as never)
      m.band = now
    }
    for (const c of [...cats].sort(byId)) {
      const now = catBand(c.nutrition)
      if (now === c.band) continue
      emit({ kind: 'hunger_changed', id: c.id, subject: 'cat',
             from: c.band, to: now } as never)
      c.band = now
    }
  }

  /**
   * What each animal can newly see. Only arrivals are reported: a thing held in
   * view would otherwise fill a turn with the same line over and over. Mice
   * notice food, traps and cats; cats notice mice.
   */
  function resolvePerception(): void {
    refreshCache()
    for (const m of sortedMice()) {
      if (m.inHole) { m.seen = []; continue }
      const here = { x: m.x, y: m.y }
      const r = perceptionOf(m)
      const now: { id: string; what: Spottable; distance: number }[] = []
      for (const f of food) {
        if (!f.present) continue
        const d = chebyshev(here, { x: f.x, y: f.y })
        if (d <= r) now.push({ id: f.id, what: 'food', distance: d })
      }
      for (const x of traps) {
        const d = chebyshev(here, { x: x.x, y: x.y })
        if (d <= r) now.push({ id: x.id, what: 'trap', distance: d })
      }
      for (const c of cats) {
        const d = chebyshev(here, { x: c.x, y: c.y })
        if (d <= r) now.push({ id: c.id, what: 'cat', distance: d })
      }
      m.seen = report(m.id, m.seen, now)
    }
    for (const c of [...cats].sort(byId)) {
      const here = { x: c.x, y: c.y }
      const r = catPerception(c)
      const now = sortedMice()
        .filter((m) => !m.inHole)
        .map((m) => ({ id: m.id, what: 'mouse' as const,
                       distance: chebyshev(here, { x: m.x, y: m.y }) }))
        .filter((x) => x.distance <= r)
      c.seen = report(c.id, c.seen, now)
    }
  }

  function report(
    watcher: AgentId, before: readonly string[],
    now: readonly { id: string; what: Spottable; distance: number }[],
  ): string[] {
    const had = new Set(before)
    for (const x of now) {
      if (had.has(x.id)) continue
      emit({ kind: 'spotted', id: watcher, what: x.what,
             targetId: x.id, distance: x.distance } as never)
    }
    return now.map((x) => x.id).sort()
  }

  function resolveCaptures(): void {
    for (const c of [...cats].sort(byId)) {
      if (c.mode === 'eating') continue
      const prey = sortedMice().find((m) => !m.inHole && m.x === c.x && m.y === c.y)
      if (!prey) continue
      emit({ kind: 'capture', catId: c.id, mouseId: prey.id } as never)
      kill(prey, 'cat', { x: c.x, y: c.y })
      c.mode = 'eating'; c.busyUntil = tick + TIMING.catEat; c.target = null
      emit({ kind: 'cat_eating_started', id: c.id } as never)
      const restored = Math.min(CAT.mealRestores, CAT.startingNutrition - c.nutrition)
      c.nutrition = Math.min(CAT.startingNutrition, c.nutrition + CAT.mealRestores)
      emit({ kind: 'cat_fed', id: c.id, restored: Math.round(restored * 100) / 100,
             nutrition: Math.round(c.nutrition * 100) / 100 } as never)
    }
  }

  function resolveHoleEntries(): void {
    for (const m of sortedMice()) {
      // busyWith must be checked: a nesting mouse that is already giving birth
      // would otherwise re-enter this every tick and push its own deadline
      // forward forever, so no litter was ever delivered.
      if (m.inHole || m.isPup || m.busyWith !== null) continue
      if (m.intent !== 'hide' && m.intent !== 'nest') continue
      const h = holes.find((x) => x.x === m.x && x.y === m.y && x.adult === null && x.brood.length === 0)
      if (!h) continue
      if (m.intent === 'nest' && m.pregnantSince !== null
          && tick - m.pregnantSince >= TIMING.gestation) {
        m.busyWith = 'birth'; m.busyUntil = tick + TIMING.birth
        continue
      }
      h.adult = m.id; m.inHole = h.id
      emit({ kind: 'hole_entered', id: m.id, holeId: h.id, as: 'adult' } as never)
    }
  }

  function resolveMating(): void {
    for (const m of sortedMice()) {
      if (m.intent !== 'seek_mate' || m.inHole || m.busyWith !== null) continue
      if (m.age < TIMING.juvenile || m.pregnantSince !== null) continue
      const partner = sortedMice().find((o) =>
        o.id !== m.id && o.sex !== m.sex && !o.inHole && o.busyWith === null
        && o.age >= TIMING.juvenile && o.pregnantSince === null
        && o.intent !== 'eat' && o.intent !== 'flee'
        && chebyshev({ x: m.x, y: m.y }, { x: o.x, y: o.y }) <= 1)
      if (!partner) continue
      const hole = holes.find((h) => h.adult === null && h.brood.length === 0
        && chebyshev({ x: m.x, y: m.y }, { x: h.x, y: h.y }) <= 3)
      if (!hole) continue
      m.busyWith = 'mate'; m.busyUntil = tick + TIMING.mate
      partner.busyWith = 'mate'; partner.busyUntil = tick + TIMING.mate
      const female = m.sex === 'female' ? m : partner
      female.pregnantSince = tick
      emit({ kind: 'mating', a: m.id, b: partner.id, holeId: hole.id } as never)
      emit({ kind: 'gestation_started', id: female.id } as never)
    }
  }

  function resolveBirths(): void {
    for (const m of sortedMice()) {
      if (m.busyWith === 'mate' && tick >= m.busyUntil) m.busyWith = null
      if (m.busyWith !== 'birth' || tick < m.busyUntil) continue
      m.busyWith = null
      const hole = holes.find((h) => h.x === m.x && h.y === m.y
        && h.adult === null && h.brood.length === 0)
      if (!hole) { m.intentSetAt = -TIMING.intentHold; continue }
      const litter = 2 + rng.int(3)
      const pups: AgentId[] = []
      for (let i = 0; i < litter; i++) {
        if (mice.length >= caps.mice) {
          emit({ kind: 'cap_limited_birth', motherId: m.id, lost: litter - i } as never)
          break
        }
        const sex: Sex = rng.next() < 0.5 ? 'male' : 'female'
        const personality = drawPersonality(config, rng.next())
        const pup = newMouse(`m${pad(nextMouse++)}`, sex, personality,
          { x: hole.x, y: hole.y }, PUP_NUTRITION, true)
        pup.inHole = hole.id
        mice.push(pup); pups.push(pup.id)
        emit({ kind: 'birth', motherId: m.id, pupId: pup.id, personality, sex } as never)
      }
      if (pups.length > 0) {
        hole.brood = pups
        emit({ kind: 'brood_born', holeId: hole.id, motherId: m.id, pups } as never)
      }
      m.pregnantSince = null
      // the mother stays outside
      const away = NEIGHBOURS.slice(1).map((n) => ({ x: m.x + n.dx, y: m.y + n.dy }))
        .find((c) => c.x >= 0 && c.x < width && c.y >= 0 && c.y < height
          && !occupiedByAnimal(c.x, c.y) && !holes.some((h) => h.x === c.x && h.y === c.y))
      if (away) { m.x = away.x; m.y = away.y }
      m.intentSetAt = -TIMING.intentHold
    }
  }

  function exchangeAlarms(): void {
    for (const a of sortedMice()) {
      if (a.inHole) continue
      const range = a.personality === 'social' ? ALARM_RANGE.social : ALARM_RANGE.normal
      for (const b of sortedMice()) {
        if (b.id <= a.id || b.inHole) continue
        if (chebyshev({ x: a.x, y: a.y }, { x: b.x, y: b.y }) > range) continue
        const last = a.alarmedAt[b.id] ?? -9999
        if (tick - last < 50) continue
        a.alarmedAt[b.id] = tick; b.alarmedAt[a.id] = tick
        share(a, b); share(b, a)
      }
    }
  }

  function share(from: MouseState, to: MouseState): void {
    const mem = freshestSeen(from.memories)
    if (!mem) return
    if (to.memories.some((x) => x.at.x === mem.at.x && x.at.y === mem.at.y)) return
    const sentence = sentenceFor(mem.kind, mem.bearing, tick - mem.addedAt, 'heard')
    to.memories = addMemory(to.memories, {
      sentence, provenance: 'heard', addedAt: tick,
      bearing: mem.bearing, at: mem.at, kind: mem.kind,
    })
    emit({ kind: 'alarm_exchanged', from: from.id, to: to.id, sentence,
           senderProvenance: mem.provenance } as never)
    emit({ kind: 'memory_added', id: to.id, sentence,
           provenance: 'heard', bearing: mem.bearing } as never)
  }

  function witness(kind: Memory['kind'], at: Cell, only?: readonly AgentId[]): void {
    for (const m of sortedMice()) {
      if (only && !only.includes(m.id)) continue
      if (!only && chebyshev({ x: m.x, y: m.y }, at) > perceptionOf(m)) continue
      const bearing = bearingFrom({ x: m.x, y: m.y }, at)
      const sentence = sentenceFor(kind, bearing, 0, 'seen')
      m.memories = addMemory(m.memories, {
        sentence, provenance: 'seen', addedAt: tick, bearing, at: { ...at }, kind,
      })
      emit({ kind: 'memory_added', id: m.id, sentence, provenance: 'seen', bearing } as never)
    }
  }

  function kill(m: MouseState, cause: 'starvation' | 'trap' | 'cat', at?: Cell): void {
    if (!mice.some((x) => x.id === m.id)) return
    mice = mice.filter((x) => x.id !== m.id)
    for (const h of holes) {
      if (h.adult === m.id) { h.adult = null; emit({ kind: 'hole_freed', holeId: h.id } as never) }
      if (h.brood.includes(m.id)) h.brood = h.brood.filter((x) => x !== m.id)
    }
    emit({ kind: 'death', id: m.id, cause } as never)
    if (cause === 'trap') witness('trap_death', at ?? { x: m.x, y: m.y })
    if (cause === 'cat') witness('cat_kill', at ?? { x: m.x, y: m.y })
  }

  // -------------------------------------------------------------------- api

  function world(): WorldView {
    return {
      tick, width, height,
      mice: sortedMice().map((m) => ({
        id: m.id, sex: m.sex, personality: m.personality, nutrition: m.nutrition,
        age: m.age, at: { x: m.x, y: m.y }, inHole: m.inHole, intent: m.intent,
        memories: m.memories.map((x) => ({ ...x })), pregnantSince: m.pregnantSince, fear: m.fear,
      })),
      cats: [...cats].sort(byId).map((c) => ({
        id: c.id, at: { x: c.x, y: c.y }, mode: c.mode, target: c.target,
        pounceCooldown: c.pounceCooldown, patience: c.patience,
        lastSighting: c.lastSighting ? { ...c.lastSighting } : null,
        nutrition: c.nutrition, hungry: isHungry(c),
      })),
      food: food.map((f) => ({ id: f.id, at: { x: f.x, y: f.y }, present: f.present })),
      traps: traps.map((t) => ({ id: t.id, at: { x: t.x, y: t.y }, occupantId: t.occupantId })),
      holes: holes.map((h) => ({
        id: h.id, at: { x: h.x, y: h.y },
        occupancy: h.adult ? 'adult' : h.brood.length > 0 ? 'brood' : 'empty',
      })),
    }
  }

  return {
    step: advance,
    run: async (n: number) => { for (let i = 0; i < n && !ended; i++) await advance() },
    world,
    events: () => buffer,
    drain: () => { const out = buffer; buffer = []; return out },
    serialize: (): Snapshot => JSON.parse(JSON.stringify({
      version: 1, tick, seq, seed, engineVersion: ENGINE_VERSION, config,
      rng: rng.state(), mice, cats, food, traps, holes, nextMouse, ended, batchNo,
    })) as Snapshot,
    candidateScores: (id) => {
      const m = mice.find((x) => x.id === id)
      if (!m) throw new Error(`no mouse ${id}`)
      return scoresFor(m)
    },
    setFear: (id, fear) => { const m = mice.find((x) => x.id === id); if (m) m.fear = fear },
    intentHoldFor: intentHold,
  }
}

class TimeoutError extends Error {}
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError('decision timed out')), ms)
    p.then((v) => { clearTimeout(timer); resolve(v) },
           (e: unknown) => { clearTimeout(timer); reject(e instanceof Error ? e : new Error(String(e))) })
  })
}
