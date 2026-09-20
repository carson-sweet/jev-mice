// The two behavioural checks, written as streaming reducers so the analysis
// views can run them without holding a whole record in memory.

import type { Metric, Personality, RunConfig, SimEvent } from './types.js'
import { PERSONALITIES } from './types.js'

/**
 * Of the mice that were threatened and healthy enough to run, how many put real
 * weight on getting away. Mice with a cat in an adjacent cell are excluded: a
 * reflex preempts their decision so they never produce a decision event.
 */
export async function fleeOrHideRate(chunks: AsyncIterable<SimEvent[]>): Promise<Metric> {
  let qualifying = 0, passing = 0
  for await (const batch of chunks) {
    for (const ev of batch) {
      if (ev.kind !== 'decision_returned') continue
      for (const s of ev.subjects) {
        const surroundings = (s.state as { surroundings?: { cats?: string } }).surroundings
        const cats = String(surroundings?.cats ?? '')
        if (!cats.includes('very close')) continue
        const hunger = String((s.state as { mouse?: { hunger?: string } }).mouse?.hunger ?? '')
        if (hunger !== 'full' && hunger !== 'fed') continue
        qualifying++
        const drive = s.answers['drive']
        const p = drive && drive.type === 'choice' ? drive.probabilities : {}
        if ((p['flee'] ?? 0) + (p['hide'] ?? 0) >= 0.5) passing++
      }
    }
  }
  return {
    qualifying, passing,
    rate: qualifying > 0 ? passing / qualifying : null,
    applies: qualifying >= 100, threshold: 0.8,
  }
}

/**
 * Whether the configured personality mix survived reproduction. Spawn events
 * carry the starting cohort's actual draw, which is the half an earlier version
 * of this check assumed rather than measured.
 */
export async function personalityMix(
  chunks: AsyncIterable<SimEvent[]>, config: RunConfig,
): Promise<Metric> {
  const counts: Record<Personality, number> = { bold: 0, cautious: 0, vigilant: 0, social: 0 }
  let everAlive = 0
  for await (const batch of chunks) {
    for (const ev of batch) {
      if (ev.kind === 'mouse_spawned' || ev.kind === 'birth') {
        counts[ev.personality]++
        everAlive++
      }
    }
  }
  const worstDelta = everAlive === 0 ? 0 : Math.max(...PERSONALITIES.map((p) =>
    Math.abs((counts[p] / everAlive) * 100 - (config.personality[p] ?? 0))))
  return { counts, everAlive, worstDelta, applies: everAlive >= 1000, threshold: 5 }
}
