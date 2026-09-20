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
  typeof a === 'object' && a !== null && (a as { type?: unknown }).type === 'choice'
const isScore = (a: unknown): a is ScoreAnswer =>
  typeof a === 'object' && a !== null && (a as { type?: unknown }).type === 'score'

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
      const batch: DecisionBatch = {
        subjects,
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
        ...baselineBatch(req, 0),
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
        ...baselineBatch(req, 0),
        latencyMs: Math.max(0, now() - started),
        fallbackReason: 'timeout',
      })
    }, timeoutMs + 50)
    void work.then((batch) => { clearTimeout(timer); resolve(batch) })
  })
}

function subjectFor(
  req: DecisionRequest, id: string, answers: Record<string, unknown>,
): DecisionSubject {
  const drive = answers[`drive_${id}`] ?? answers[`target_${id}`]
  const fearAnswer = answers[`fear_${id}`]
  const mine: Record<string, AnswerPayload> = {}
  for (const [name, value] of Object.entries(answers)) {
    if (name.endsWith(`_${id}`)) mine[name.slice(0, name.length - id.length - 1)] =
      value as AnswerPayload
  }

  if (!isChoice(drive)) {
    // The service answered the batch but not this agent. One missing answer
    // must not cost the whole batch, so this agent alone falls back.
    const fallback = baselineBatch(req, 0).subjects.find((s) => s.agentId === id)
    if (fallback) return fallback
  }

  const probabilities = isChoice(drive) ? drive.probabilities : { explore: 1 }
  const weights = weightsFrom(probabilities)
  const confidence = isChoice(drive) ? drive.confidence : 0
  const intent = (isChoice(drive) ? drive.choice : 'explore') as Drive
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
