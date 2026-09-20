// The exact wording sent to the decision service. Kept apart from the code that
// assembles a request so that changing what a mouse is asked is a change to one
// file, reviewable on its own, and so the tests can quote it.

import type { Drive, FearLevel, MouseView } from './types.js'

export interface Described { what: string; when?: string; not_for?: string; examples?: string[] }

export const DRIVE_CRITERIA: Record<Drive, Described> = {
  eat: {
    what: 'Go to food and eat it.',
    when: 'Hunger is pressing enough to be worth the trip, or food is close and safe.',
    not_for: 'A mouse that is full, or one that must escape an immediate threat first.',
    examples: ['A hungry mouse with a food pile nearby and no cat in sight.',
               'A starving mouse that will die without food soon.'],
  },
  flee: {
    what: 'Run away from the danger.',
    when: 'A cat is close enough to be a threat right now.',
    not_for: 'Remembered danger with no cat currently visible; that is a reason to be wary, not to run.',
    examples: ['A cat very close and stalking toward this mouse.'],
  },
  hide: {
    what: 'Run to a free mousehole and wait there, safe but unable to eat.',
    when: 'Danger is present, shelter is reachable, and this mouse can afford to wait.',
    not_for: 'A starving mouse, which would die waiting.',
    examples: ['A cautious mouse with a cat nearby and a free mousehole close by.'],
  },
  seek_mate: {
    what: 'Approach another mouse to mate.',
    when: 'This mouse is safe, well fed, and a suitable partner is visible.',
    not_for: 'A hungry mouse, or one with a cat in sight.',
    examples: ['A fed mouse with no danger nearby and a healthy partner very close.'],
  },
  nest: {
    what: 'Go to a free mousehole to give birth.',
    when: 'This mouse is carrying a litter and ready, and shelter is available.',
    not_for: 'Any mouse that is not carrying a litter.',
    examples: ['A pregnant mouse ready to give birth with a free mousehole nearby.'],
  },
  explore: {
    what: 'Wander into unfamiliar ground looking for food, mates, or shelter.',
    when: 'Nothing else is pressing.',
    not_for: 'A mouse with a clear immediate need.',
    examples: ['A fed mouse with no food, danger, or partner in sight.'],
  },
}

/** Indexed by score, in the same order as FEAR_LEVELS. */
export const FEAR_RUBRIC: readonly { what: string; signals: string[] }[] = [
  { what: 'Unconcerned. Nothing threatening in sight or in memory.',
    signals: ['No cat visible', 'No remembered deaths nearby'] },
  { what: 'Wary. Something is off, but nothing immediate.',
    signals: ['A cat was around recently but is not visible now',
              'A remembered death some distance away'] },
  { what: 'Alarmed. Real danger is present or freshly remembered.',
    signals: ['A cat is visible and hunting', 'A mouse died nearby just now'] },
  { what: 'Panicked. Danger is immediate and close.',
    signals: ['A cat is adjacent or very close and coming',
              'This mouse just escaped a trap'] },
] as const

export const CAT_MODE_CRITERIA: Record<string, Described> = {
  prowl: { what: 'Wander and look for a better opportunity.' },
  stalk: { what: 'Close on the chosen mouse steadily, one step at a time.' },
  pounce: { what: 'Spring two cells at the chosen mouse now.',
            when: 'Only when it is very close and the cat is not still recovering from the last pounce.' },
  rest: { what: 'Hold still and wait.' },
}

export function driveQuestion(id: string, options: readonly Drive[]): Record<string, unknown> {
  const criteria: Record<string, Described> = {}
  for (const d of options) criteria[d] = DRIVE_CRITERIA[d]
  return {
    type: 'choice',
    instructions: {
      question: `What should the mouse at \`${id}\` do right now?`,
      focus: 'Weigh how hungry it is against the danger it can see or remembers, '
           + 'and account for its personality. Pick the one drive that fits this moment.',
    },
    criteria,
  }
}

export function fearQuestion(id: string): Record<string, unknown> {
  return {
    type: 'score',
    instructions: {
      question: `How afraid should the mouse at \`${id}\` be right now?`,
      focus: 'Judge fear from what it can see and what it remembers, and from its '
           + 'personality. This is about how much room it should give danger, '
           + 'not about what it should do.',
    },
    criteria: FEAR_RUBRIC,
  }
}

export function catTargetQuestion(
  id: string, candidates: readonly { id: string; description: string }[],
): Record<string, unknown> {
  const criteria: Record<string, Described> = {}
  for (const c of candidates) criteria[c.id] = { what: c.description }
  criteria.none_worth_it = {
    what: 'No mouse here is worth chasing.',
    when: 'Every mouse is fast, far, or about to reach shelter.',
  }
  return {
    type: 'choice',
    instructions: {
      question: `Which mouse should the cat at \`${id}\` go after?`,
      focus: 'Prefer a mouse that is easy to catch: slow, alone, out in the open, '
           + 'and close. A mouse heading for a mousehole may escape.',
    },
    criteria,
  }
}

export function catModeQuestion(id: string): Record<string, unknown> {
  return {
    type: 'choice',
    instructions: {
      question: `How should the cat at \`${id}\` move now?`,
      focus: 'Match the approach to the distance and to how likely the mouse is to escape.',
    },
    criteria: CAT_MODE_CRITERIA,
  }
}

/** How a cat is told about one mouse it can see. Words only, as everywhere else. */
export function catCandidateText(m: MouseView, distance: string, bearing: string,
                                 companions: number): string {
  const pace = m.nutrition >= 60 ? 'moving at full speed'
    : m.nutrition >= 30 ? 'moving slowly because it is hungry'
    : 'barely moving, close to starving'
  const company = companions === 0 ? 'alone'
    : companions === 1 ? 'with one other mouse'
    : `among ${String(companions)} other mice`
  return `${pace.charAt(0).toUpperCase()}${pace.slice(1)}, ${company}, ${distance} to the ${bearing}.`
}

export const FEAR_FROM_SCORE = (
  score: number, levels: readonly [FearLevel, ...FearLevel[]] | readonly FearLevel[],
): FearLevel => {
  const i = Math.max(0, Math.min(levels.length - 1, Math.round(score)))
  return levels[i] ?? levels[0]
}
