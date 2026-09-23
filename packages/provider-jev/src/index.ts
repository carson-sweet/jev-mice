// Turns the engine's decision requests into System One requests and the answers
// back into decisions. It holds no state and no key; the caller supplies a
// client that already has one, which is what keeps the key out of this package
// and out of anything the engine can reach.

import {
  baselineBatch, FEAR_FROM_SCORE, FEAR_LEVELS,
  type AnswerPayload, type CatMode, type DecisionBatch, type DecisionProvider,
  type DecisionRequest, type DecisionSubject, type Drive, type FearLevel,
} from '@jev-mice/engine'

/** What a request looks like on the wire. Matches the TypeSafe SDK's shape. */
export interface SystemOneRequestLike {
  state: unknown
  questions: unknown
  model?: string
}

export interface SystemOneResultLike {
  model: string
  answers: Record<string, unknown>
  usage?: { input_tokens: number; output_tokens: number }
}

/**
 * The one method this provider needs. `TypeSafeClient` satisfies it
 * structurally, so the real client can be passed straight in and a test can
 * pass a fake without the SDK being installed.
 */
export interface SystemOneLike {
  systemOne(
    request: SystemOneRequestLike,
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<SystemOneResultLike>
}

export interface JevProviderOptions {
  /** How long one batch may take before the rules answer instead. */
  timeoutMs?: number
  model?: string
  /** Called for every batch, judged or not, so a caller can meter usage. */
  onBatch?: (batch: DecisionBatch, request: DecisionRequest) => void
  now?: () => number
}

const DEFAULT_TIMEOUT_MS = 2_000

interface ChoiceAnswer {
  type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number>
}
interface ScoreAnswer {
  type: 'score'; score: number; confidence: number; probabilities: Record<string, number>
}

const isChoice = (a: unknown): a is ChoiceAnswer =>
  typeof a === 'object' && a !== null
  && (a as { type?: unknown }).type === 'choice'
  && typeof (a as { choice?: unknown }).choice === 'string'
  && typeof (a as { confidence?: unknown }).confidence === 'number'
  && Number.isFinite((a as { confidence: number }).confidence)
  && (a as { confidence: number }).confidence >= 0
  && (a as { confidence: number }).confidence <= 1
  && typeof (a as { probabilities?: unknown }).probabilities === 'object'
  && (a as { probabilities?: unknown }).probabilities !== null
const isScore = (a: unknown): a is ScoreAnswer =>
  typeof a === 'object' && a !== null
  && (a as { type?: unknown }).type === 'score'
  && typeof (a as { score?: unknown }).score === 'number'
  && Number.isFinite((a as { score: number }).score)
  && typeof (a as { confidence?: unknown }).confidence === 'number'
  && Number.isFinite((a as { confidence: number }).confidence)
  && (a as { confidence: number }).confidence >= 0
  && (a as { confidence: number }).confidence <= 1
  && typeof (a as { probabilities?: unknown }).probabilities === 'object'
  && (a as { probabilities?: unknown }).probabilities !== null

const criteriaLabels = (question: unknown): string[] => {
  if (typeof question !== 'object' || question === null) return []
  const criteria = (question as { criteria?: unknown }).criteria
  return typeof criteria === 'object' && criteria !== null && !Array.isArray(criteria)
    ? Object.keys(criteria)
    : []
}

const probabilitiesAreValid = (p: Record<string, number>, labels: readonly string[]): boolean => {
  if (labels.length === 0) return false
  const entries = Object.entries(p)
  return entries.length === labels.length
    && entries.every(([label, value]) => labels.includes(label) && Number.isFinite(value) && value >= 0)
    && entries.some(([, value]) => value > 0)
}

const scoreIsValid = (answer: ScoreAnswer, question: unknown): boolean => {
  if (typeof question !== 'object' || question === null) return false
  const criteria = (question as { criteria?: unknown }).criteria
  if (!Array.isArray(criteria) || criteria.length === 0
      || answer.score < 0 || answer.score > criteria.length - 1) return false
  const entries = Object.entries(answer.probabilities)
  return entries.length === criteria.length
    && entries.every(([label, value]) => {
      const level = Number(label)
      return Number.isInteger(level) && level >= 0 && level < criteria.length
        && Number.isFinite(value) && value >= 0
    })
    && entries.some(([, value]) => value > 0)
}

/** Renormalized so the weights the engine receives always sum to one. */
function weightsFrom(probabilities: Record<string, number>): Record<string, number> {
  const entries = Object.entries(probabilities).filter(([, v]) => Number.isFinite(v) && v > 0)
  const total = entries.reduce((t, [, v]) => t + v, 0)
  if (entries.length === 0 || total <= 0) return { explore: 1 }
  return Object.fromEntries(entries.map(([k, v]) => [k, v / total]))
}

export function jevProvider(client: SystemOneLike, opts: JevProviderOptions = {}): DecisionProvider {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const now = opts.now ?? (() => Date.now())

  async function one(req: DecisionRequest): Promise<DecisionBatch> {
    const started = now()
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, timeoutMs)
    try {
      const result = await client.systemOne(
        {
          state: req.state,
          questions: req.questions,
          ...(opts.model === undefined ? {} : { model: opts.model }),
        },
        { signal: controller.signal, timeout: timeoutMs },
      )
      const subjects = req.agents.map((id) => subjectFor(req, id, result.answers))
      if (subjects.some((subject) => subject === null)) {
        return {
          ...baselineBatch(req, req.tick),
          latencyMs: Math.max(0, now() - started),
          fallbackReason: 'error',
        }
      }
      const batch: DecisionBatch = {
        subjects: subjects as DecisionSubject[],
        source: 'jev',
        latencyMs: Math.max(0, now() - started),
        model: result.model,
        ...(result.usage === undefined ? {} : { inputTokens: result.usage.input_tokens }),
      }
      return batch
    } catch {
      // A batch the service could not answer is answered by the rules, so a
      // failure costs accuracy for those agents and nothing else.
      return {
        ...baselineBatch(req, req.tick),
        latencyMs: Math.max(0, now() - started),
        fallbackReason: controller.signal.aborted ? 'timeout' : 'error',
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    async decide(requests) {
      const batches = await Promise.all(requests.map((r) => race(one(r), r, timeoutMs, now)))
      const out: Record<string, DecisionBatch> = {}
      for (let i = 0; i < requests.length; i++) {
        const req = requests[i]
        const batch = batches[i]
        if (req === undefined || batch === undefined) continue
        out[req.batchId] = batch
        opts.onBatch?.(batch, req)
      }
      return out
    },
  }
}

/**
 * The abort signal is advisory: a client may ignore it. This guarantees the
 * engine gets an answer within the budget whether or not the client cooperates.
 */
function race(
  work: Promise<DecisionBatch>, req: DecisionRequest, timeoutMs: number, now: () => number,
): Promise<DecisionBatch> {
  const started = now()
  return new Promise<DecisionBatch>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        ...baselineBatch(req, req.tick),
        latencyMs: Math.max(0, now() - started),
        fallbackReason: 'timeout',
      })
    }, timeoutMs + 50)
    void work.then((batch) => { clearTimeout(timer); resolve(batch) })
  })
}

function subjectFor(
  req: DecisionRequest, id: string, answers: Record<string, unknown>,
): DecisionSubject | null {
  const drive = answers[`drive_${id}`] ?? answers[`target_${id}`]
  const fearAnswer = answers[`fear_${id}`]
  const modeAnswer = answers[`mode_${id}`]
  const driveQuestion = req.questions[`drive_${id}`] ?? req.questions[`target_${id}`]
  const driveLabels = criteriaLabels(driveQuestion)
  const isCat = req.questions[`target_${id}`] !== undefined
  const modeLabels = criteriaLabels(req.questions[`mode_${id}`])
  const mine: Record<string, AnswerPayload> = {}
  for (const [name, value] of Object.entries(answers)) {
    if (name.endsWith(`_${id}`)) mine[name.slice(0, name.length - id.length - 1)] =
      value as AnswerPayload
  }

  if (!isChoice(drive) || !driveLabels.includes(drive.choice)
      || !Object.hasOwn(drive.probabilities, drive.choice)
      || !probabilitiesAreValid(drive.probabilities, driveLabels)) return null
  if (isCat && (!isChoice(modeAnswer) || !modeLabels.includes(modeAnswer.choice)
      || !probabilitiesAreValid(modeAnswer.probabilities, modeLabels))) return null
  if (!isCat && (!isScore(fearAnswer)
      || !scoreIsValid(fearAnswer, req.questions[`fear_${id}`]))) return null

  const probabilities = drive.probabilities
  const weights = weightsFrom(probabilities)
  const confidence = drive.confidence
  const intent = (isCat ? (modeAnswer as ChoiceAnswer).choice : drive.choice) as Drive | CatMode
  const fear: FearLevel = isScore(fearAnswer)
    ? FEAR_FROM_SCORE(fearAnswer.score, FEAR_LEVELS)
    : 'unconcerned'

  return {
    agentId: id,
    // Read back from what was offered, so the recorded subject says what this
    // agent could have chosen without repeating the wording of the question.
    options: Object.keys(probabilities) as (Drive | CatMode)[],
    state: (req.state[id] ?? {}) as Record<string, unknown>,
    answers: mine,
    intent,
    lowConfidence: confidence < 0.5,
    fear,
    weights,
  }
}
