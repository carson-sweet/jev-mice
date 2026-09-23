// The contract between the engine and whatever decides: bucketing numbers into
// words, composing a request, and the fixed-weight rules that stand in when no
// model is available.

import type {
  AgentId, AnswerPayload, CatMode, DecisionBatch, DecisionProvider, DecisionRequest,
  DecisionSubject, Drive, FearLevel, Memory, Personality, Sex, Tick, WorldView,
} from './types.js'
import {
  BATCH_SIZE, CAT, DRIVES, FEAR_LEVELS, NUTRITION_BANDS, PERSONALITY_TEXT, TIMING,
} from './types.js'
import { chebyshev } from './signals.js'
import { bearingFrom } from './memory.js'
import {
  catCandidateText, catModeQuestion, catTargetQuestion, driveQuestion, fearQuestion,
} from './questions.js'

// ------------------------------------------------------------------ bucketing

export function bucketNutrition(pct: number): string {
  if (pct >= 90) return 'full'
  if (pct >= NUTRITION_BANDS.fed) return 'fed'
  if (pct >= NUTRITION_BANDS.hungry) return 'hungry'
  if (pct >= 10) return 'very hungry'
  return 'starving'
}

export function bucketDistance(cells: number): string {
  if (cells <= 1) return 'adjacent'
  if (cells <= 3) return 'very close'
  if (cells <= 6) return 'nearby'
  return 'far'
}

export function bucketAge(ticks: Tick): string {
  if (ticks < TIMING.juvenile) return 'a pup, too young to mate'
  if (ticks <= 200) return 'a young adult'
  return 'a grown adult'
}

export function catStateWord(mode: CatMode, closing: boolean): string {
  if (mode === 'eating') return 'eating a mouse'
  if (mode === 'rest') return 'resting'
  if (mode === 'pounce') return 'about to pounce'
  if (mode === 'stalk' || closing) return 'stalking toward you'
  return 'prowling'
}

// ------------------------------------------------------- state for one mouse

export interface MouseContext {
  id: AgentId
  sex: Sex
  personality: Personality
  nutrition: number
  age: Tick
  pregnantPastTerm: boolean
  movingSlowly: boolean
  nearestCat: { distance: number; bearing: string; word: string } | null
  nearestFood: { distance: number; bearing: string; suspect: boolean } | null
  nearestMate: { distance: number; bearing: string; condition: string } | null
  nearestShelter: { distance: number; bearing: string } | null
  knownTrap: { distance: number; bearing: string } | null
  memories: readonly Memory[]
  options: readonly Drive[]
}

function phrase(label: string, d: number, bearing: string): string {
  return `${label} ${bucketDistance(d)} to the ${bearing}`
}

export function stateForMouse(c: MouseContext): Record<string, unknown> {
  const surroundings: Record<string, string> = {}
  surroundings['food'] = c.nearestFood
    ? phrase(c.nearestFood.suspect ? 'a food smell' : 'a food pile',
             c.nearestFood.distance, c.nearestFood.bearing)
    : 'nothing to eat that you can smell'
  surroundings['cats'] = c.nearestCat
    ? `a cat ${bucketDistance(c.nearestCat.distance)} to the ${c.nearestCat.bearing}, ${c.nearestCat.word}`
    : 'no cat in sight'
  surroundings['mice'] = c.nearestMate
    ? `${c.nearestMate.condition}, ${phrase('', c.nearestMate.distance, c.nearestMate.bearing).trim()}`
    : 'no other mouse worth approaching in sight'
  surroundings['shelter'] = c.nearestShelter
    ? phrase('a free mousehole', c.nearestShelter.distance, c.nearestShelter.bearing)
    : 'no free mousehole in reach'
  surroundings['knownTraps'] = c.knownTrap
    ? phrase('a trap you know about', c.knownTrap.distance, c.knownTrap.bearing)
    : 'no trap you know about nearby'

  const mouse: Record<string, string> = {
    sex: c.sex,
    age: bucketAge(c.age),
    hunger: bucketNutrition(c.nutrition),
    personality: PERSONALITY_TEXT[c.personality],
    condition: c.movingSlowly ? 'moving slowly because it is hungry' : 'moving at full speed',
  }
  if (c.pregnantPastTerm) mouse['pregnant'] = 'carrying a litter, ready to give birth'

  return { mouse, surroundings, memories: c.memories.map((m) => m.sentence) }
}

/**
 * One readable line describing what a mouse was asked, for the decisions log.
 *
 * A subject's full state is about a kilobyte, which is far more than a reader
 * can take in and far more than is worth carrying anywhere. This keeps only
 * what an answer has to be judged against -- the condition the mouse is in and
 * what is actually around it -- and drops the absences, because five "nothing
 * in sight" clauses on one line bury the one thing that matters.
 *
 * Tolerant of shapes it does not know: a cat's state has none of these fields,
 * and nothing on the way to a log line may throw.
 */
export function situationLine(state: unknown): string {
  if (typeof state !== 'object' || state === null) return ''
  const s = state as { mouse?: Record<string, unknown>; surroundings?: Record<string, unknown> }
  const mouse = s.mouse
  if (typeof mouse !== 'object' || mouse === null) return ''

  const parts: string[] = []
  if (typeof mouse['hunger'] === 'string') parts.push(mouse['hunger'])
  // The catalogue entry is a sentence; the log wants the word it starts with.
  if (typeof mouse['personality'] === 'string') {
    const word = mouse['personality'].split(':')[0]?.trim().toLowerCase()
    if (word) parts.push(word)
  }

  const around: string[] = []
  for (const key of ['cats', 'food', 'shelter', 'knownTraps', 'mice'] as const) {
    const v = s.surroundings?.[key]
    // An absence is phrased as "no ..." or "nothing ...", and is dropped.
    if (typeof v === 'string' && !/^(no|nothing)\b/.test(v)) around.push(v)
  }
  parts.push(around.length > 0 ? around.join('; ') : 'nothing in sight')
  return parts.join(', ')
}

// --------------------------------------------------------------- composition

/**
 * Group decision-ready mice by a deterministic spatial sort and fill batches of
 * eight. Confining a group to a fixed tile, which an earlier design did, almost
 * never let mice share a request and produced nearly seven times the traffic.
 */
export const BLOCK = 16

export function spatialOrder<T extends { id: AgentId; at: { x: number; y: number } }>(
  agents: readonly T[],
): T[] {
  // Order by coarse block, serpentine so consecutive blocks touch, then by
  // position inside the block. Ordering is all this does: a batch may still
  // straddle a block boundary, which is what keeps batches full. Confining a
  // batch to one block is what produced nearly seven times the request traffic.
  const key = (p: { x: number; y: number }) => {
    const bx = Math.floor(p.x / BLOCK), by = Math.floor(p.y / BLOCK)
    return by * 1000 + (by % 2 === 0 ? bx : 999 - bx)
  }
  return [...agents].sort((a, b) => {
    const ka = key(a.at), kb = key(b.at)
    if (ka !== kb) return ka - kb
    if (a.at.y !== b.at.y) return a.at.y - b.at.y
    if (a.at.x !== b.at.x) return a.at.x - b.at.x
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

/**
 * Batch identifiers come from the caller rather than a module counter. A counter
 * here would be shared by every engine in the process, which made two runs with
 * the same seed produce different identifiers and broke replay.
 */
export function composeRequests(
  world: WorldView, ready: readonly AgentId[], nextBatchId: () => string,
): DecisionRequest[] {
  const readySet = new Set(ready)
  const mice = world.mice.filter((m) => readySet.has(m.id) && !m.inHole)
  const cats = world.cats.filter((c) => readySet.has(c.id))
  const requests: DecisionRequest[] = []

  for (const group of chunk(spatialOrder(mice), BATCH_SIZE)) {
    const state: Record<string, unknown> = {}
    const questions: Record<string, unknown> = {}
    const contexts: Record<string, unknown> = {}
    for (const m of group) {
      const ctx = contextFor(world, m.id)
      contexts[m.id] = ctx
      state[m.id] = stateForMouse(ctx)
      questions[`drive_${m.id}`] = driveQuestion(m.id, ctx.options)
      questions[`fear_${m.id}`] = fearQuestion(m.id)
    }
    requests.push({ batchId: nextBatchId(), tick: world.tick, state, questions, contexts,
                    agents: group.map((m) => m.id) })
  }

  for (const group of chunk(spatialOrder(cats), BATCH_SIZE)) {
    const state: Record<string, unknown> = {}
    const questions: Record<string, unknown> = {}
    const contexts: Record<string, unknown> = {}
    for (const c of group) {
      const reach = c.hungry ? CAT.perceptionHungry : CAT.perception
      const seen = world.mice
        .filter((m) => !m.inHole && chebyshev(m.at, c.at) <= reach)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
      const candidates = seen.map((m) => ({
        id: m.id,
        description: catCandidateText(
          m, bucketDistance(chebyshev(m.at, c.at)), bearingFrom(c.at, m.at),
          seen.filter((o) => o.id !== m.id && chebyshev(o.at, m.at) <= 2).length,
        ),
      }))
      contexts[c.id] = { at: c.at, mode: c.mode, candidates: seen.map((m) => ({
        id: m.id, distance: chebyshev(m.at, c.at), nutrition: m.nutrition })) }
      state[c.id] = {
        cat: {
          doing: c.mode === 'rest' ? 'resting' : `${c.mode}ing`,
          hunger: c.nutrition >= CAT.hungryBelow ? 'well fed'
            : c.nutrition > CAT.hungryBelow / 2 ? 'hungry' : 'starving',
          pounce: c.pounceCooldown === 0 ? 'ready to pounce' : 'recovering from the last pounce',
        },
        mice: candidates.map((x) => x.description),
      }
      questions[`target_${c.id}`] = catTargetQuestion(c.id, candidates)
      questions[`mode_${c.id}`] = catModeQuestion(c.id)
    }
    requests.push({ batchId: nextBatchId(), tick: world.tick, state, questions, contexts,
                    agents: group.map((c) => c.id) })
  }
  return requests
}

/** Built from a world view so the composer can be used without engine internals. */
export function contextFor(world: WorldView, id: AgentId): MouseContext {
  const m = world.mice.find((x) => x.id === id)
  if (!m) throw new Error(`no mouse ${id}`)
  const perception = m.personality === 'vigilant' ? 8 : 6
  const near = <T extends { at: { x: number; y: number } }>(xs: readonly T[], limit = perception) => {
    let best: { item: T; d: number } | null = null
    for (const x of xs) {
      const d = chebyshev(m.at, x.at)
      if (d > limit) continue
      if (!best || d < best.d) best = { item: x, d }
    }
    return best
  }
  const bearingOf = (to: { x: number; y: number }): string => {
    const dx = Math.sign(to.x - m.at.x), dy = Math.sign(to.y - m.at.y)
    return ([['northwest','north','northeast'],['west','here','east'],['southwest','south','southeast']]
      [dy + 1] as string[])[dx + 1] as string
  }
  const cat = near(world.cats)
  const food = near(world.food.filter((f) => f.present), 999)
  const hole = near(world.holes.filter((h) => h.occupancy === 'empty'), 999)
  const mate = near(world.mice.filter((o) =>
    o.id !== m.id && o.sex !== m.sex && o.age >= TIMING.juvenile && !o.inHole))
  const knownTrap = near(world.traps.filter((t) =>
    m.memories.some((mem) => mem.at.x === t.at.x && mem.at.y === t.at.y)), 999)

  return {
    id: m.id, sex: m.sex, personality: m.personality,
    nutrition: m.nutrition, age: m.age,
    pregnantPastTerm: m.pregnantSince !== null && world.tick - m.pregnantSince >= TIMING.gestation,
    movingSlowly: m.nutrition < NUTRITION_BANDS.fed,
    nearestCat: cat ? { distance: cat.d, bearing: bearingOf(cat.item.at),
                        word: catStateWord(cat.item.mode, cat.item.target === m.id) } : null,
    nearestFood: food ? { distance: food.d, bearing: bearingOf(food.item.at), suspect: false } : null,
    nearestMate: mate ? { distance: mate.d, bearing: bearingOf(mate.item.at),
                          condition: `a ${mate.item.personality} ${mate.item.sex}, ${bucketNutrition(mate.item.nutrition)}` } : null,
    nearestShelter: hole ? { distance: hole.d, bearing: bearingOf(hole.item.at) } : null,
    knownTrap: knownTrap ? { distance: knownTrap.d, bearing: bearingOf(knownTrap.item.at) } : null,
    memories: m.memories,
    options: availableDrives({
      food: food !== null, danger: cat !== null,
      shelter: hole !== null, mate: mate !== null,
      nesting: m.pregnantSince !== null && world.tick - m.pregnantSince >= TIMING.gestation,
      nutrition: m.nutrition,
    }),
  }
}

export function availableDrives(p: {
  food: boolean; danger: boolean; shelter: boolean; mate: boolean; nesting: boolean
  nutrition: number
}): Drive[] {
  const out: Drive[] = ['explore']
  if (p.food) out.unshift('eat')
  if (p.danger) out.unshift('flee')
  // Hunger below the fed band ejects an adult from a hole, so offering hide to
  // a mouse under it produced a mouse that entered and was thrown out every
  // tick, burning every turn on the doorstep until something caught it. The
  // question's own wording already says hide is not for a mouse that would die
  // waiting; this is the two rules agreeing.
  if (p.shelter && p.nutrition >= NUTRITION_BANDS.fed) out.push('hide')
  if (p.mate) out.push('seek_mate')
  // Delivering a litter is not waiting out danger, so hunger does not bar it.
  if (p.nesting && p.shelter) out.push('nest')
  return DRIVES.filter((d) => out.includes(d))
}

// -------------------------------------------------------------- code-only rules

const choice = (probs: Record<string, number>): AnswerPayload => {
  const entries = Object.entries(probs)
  const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a))
  const spread = entries.reduce((t, [, v]) => t + v * v, 0)
  return { type: 'choice', choice: top[0], probabilities: probs, confidence: spread }
}

/** The least weight a visible cat gets, whatever else a mouse is doing. */
export const DANGER_FLOOR = 0.2

/** The ordered rule ladder; the first matching row supplies the weights. */
export function baselineDrive(c: MouseContext): Record<string, number> {
  const dCat = c.nearestCat?.distance ?? Infinity
  const dHole = c.nearestShelter?.distance ?? Infinity
  const has = (d: Drive) => c.options.includes(d)
  const pick = (o: Partial<Record<Drive, number>>): Record<string, number> => {
    const out: Record<string, number> = {}
    let total = 0
    for (const d of c.options) { const v = o[d] ?? 0; out[d] = v; total += v }
    if (total === 0) { for (const d of c.options) out[d] = d === 'explore' ? 1 : 0; return out }
    for (const d of c.options) out[d] = (out[d] ?? 0) / total
    return out
  }
  /**
   * A cat this mouse can see always keeps some weight on running from it, even
   * when another row wins.
   *
   * The weights are the movement field's multipliers, so a flee weight of zero
   * zeroes the danger term and the mouse chooses where to step without seeing
   * the cat at all. Between the flee row (a cat within 2 and no shelter) and
   * the hide row (shelter within 4) there was a gap: a cat at 3 to 6 cells with
   * no shelter reachable fell through to eating, mating or exploring, all of
   * which left flee at nothing. A floor rather than another row, because the
   * ladder's priorities are right; it is only the blindness that is wrong. The
   * floor never outweighs the winning row, so no row changes what it chooses.
   */
  const seen = (w: Record<string, number>): Record<string, number> => {
    if (!has('flee') || !Number.isFinite(dCat) || (w.flee ?? 0) > 0) return w
    const out: Record<string, number> = { ...w, flee: DANGER_FLOOR }
    const total = Object.values(out).reduce((a, b) => a + b, 0)
    for (const k of Object.keys(out)) out[k] = (out[k] ?? 0) / total
    return out
  }

  if (dCat <= 2 && dHole > 4 && has('flee')) return pick({ flee: 0.85, explore: 0.15 })
  if (dCat <= 4 && dHole <= 4 && has('hide')) return pick({ hide: 0.70, flee: 0.30 })
  if (c.nutrition < 30 && has('eat')) return seen(pick({ eat: 0.90, explore: 0.10 }))
  if (c.pregnantPastTerm && has('nest')) return seen(pick({ nest: 0.80, explore: 0.20 }))
  if (c.nutrition < 60 && has('eat')) return seen(pick({ eat: 0.65, explore: 0.35 }))
  if (has('seek_mate') && c.nutrition >= 60 && dCat > 6) {
    return seen(pick({ seek_mate: 0.60, explore: 0.40 }))
  }
  return seen(pick({ explore: 1 }))
}

/**
 * How frightened this mouse is, before illness is taken into account.
 *
 * Toxoplasmosis is deliberately not here. It is applied to the answer in the
 * engine, so Jev and the baseline are affected identically and neither has to
 * be told the mouse is ill, which it has no way of knowing.
 */
export function baselineFear(c: MouseContext, tick: Tick): FearLevel {
  const d = c.nearestCat?.distance ?? Infinity
  if (d <= 1) return 'panicked'
  if (d <= 4) return 'alarmed'
  if (d <= 8) return 'wary'
  const fresh = c.memories.some((m) => m.kind !== 'narrow_escape' && tick - m.addedAt < 100)
  return fresh ? 'wary' : 'unconcerned'
}

/**
 * What the fixed rules answer for one batch. The engine uses this when a
 * provider fails and a provider uses it when the service does, so a fallback
 * looks the same wherever it was decided.
 */
export interface CatContext {
  at: { x: number; y: number }
  mode: CatMode
  candidates: { id: AgentId; distance: number; nutrition: number }[]
}

const isCatContext = (c: unknown): c is CatContext =>
  typeof c === 'object' && c !== null && Array.isArray((c as CatContext).candidates)

/**
 * The fixed rules for a cat: go after whichever mouse is cheapest to catch,
 * counting a hungry mouse as nearer than it is because it moves slower.
 */
export function baselineCat(c: CatContext): { target: AgentId | 'none_worth_it'; mode: CatMode } {
  if (c.candidates.length === 0) return { target: 'none_worth_it', mode: 'prowl' }
  const cost = (m: { distance: number; nutrition: number }): number =>
    m.distance + m.nutrition / 20
  const best = c.candidates.reduce((a, b) => (cost(b) < cost(a) ? b : a))
  return { target: best.id, mode: best.distance <= 3 ? 'pounce' : 'stalk' }
}

export function baselineSubjects(req: DecisionRequest, tick: Tick): DecisionSubject[] {
  return req.agents.map((id) => {
    const raw = req.contexts?.[id]
    if (isCatContext(raw)) return baselineCatSubject(req, id, raw)
    const ctx = raw as MouseContext | undefined
    const probs = ctx ? baselineDrive(ctx) : { explore: 1 }
    const fear: FearLevel = ctx ? baselineFear(ctx, tick) : 'unconcerned'
    const drive = choice(probs)
    return {
      agentId: id,
      state: (req.state[id] ?? {}) as Record<string, unknown>,
      options: ctx ? [...ctx.options] : ['explore'],
      answers: {
        drive,
        fear: {
          type: 'score', score: FEAR_LEVELS.indexOf(fear), confidence: 1,
          probabilities: Object.fromEntries(
            FEAR_LEVELS.map((l, i) => [i, l === fear ? 1 : 0])),
        },
      },
      intent: (drive as { choice: string }).choice as Drive,
      lowConfidence: false,
      fear,
      weights: probs,
    }
  })
}

function baselineCatSubject(req: DecisionRequest, id: AgentId, ctx: CatContext): DecisionSubject {
  const { target, mode } = baselineCat(ctx)
  const certain = (label: string, labels: readonly string[]): AnswerPayload => ({
    type: 'choice', choice: label, confidence: 1,
    probabilities: Object.fromEntries(labels.map((l) => [l, l === label ? 1 : 0])),
  })
  const targets = [...ctx.candidates.map((m) => m.id), 'none_worth_it']
  return {
    agentId: id,
    state: (req.state[id] ?? {}) as Record<string, unknown>,
    options: ['prowl', 'stalk', 'pounce', 'rest'],
    answers: {
      target: certain(target, targets),
      mode: certain(mode, ['prowl', 'stalk', 'pounce', 'rest']),
    },
    intent: mode,
    lowConfidence: false,
    fear: 'unconcerned',
    weights: {},
  }
}

export function baselineBatch(req: DecisionRequest, tick: Tick): DecisionBatch {
  return { subjects: baselineSubjects(req, tick), source: 'baseline', latencyMs: 0 }
}

export function baselineProvider(): DecisionProvider {
  return {
    decide: (requests) => {
      const out: Record<string, DecisionBatch> = {}
      for (const req of requests) out[req.batchId] = baselineBatch(req, req.tick)
      return Promise.resolve(out)
    },
  }
}

/** Rules used because a Jev run could not spend another request. */
export function fallbackProvider(reason: 'quota' | 'error' | 'timeout'): DecisionProvider {
  return {
    decide: (requests) => {
      const out: Record<string, DecisionBatch> = {}
      for (const req of requests) {
        out[req.batchId] = { ...baselineBatch(req, req.tick), fallbackReason: reason }
      }
      return Promise.resolve(out)
    },
  }
}
