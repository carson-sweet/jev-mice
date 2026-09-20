// What the deployment is willing to spend on Jev in a day.
//
// On a public URL with no accounts, every visitor's run is paid for out of one
// key. This is the whole of the protection, so it is deliberately simple: a
// running total for the day, a ceiling, and a fallback to the fixed rules once
// the ceiling is reached. Past the ceiling the site keeps working rather than
// turning people away, and the page says why it is on the cheaper path.
//
// The state carries the day it belongs to. Reading the ceiling against that day
// rather than trusting a reset means a missed alarm leaves yesterday's spend
// behind instead of standing in front of today's runs.

import type { Allowance } from '@jev-mice/sim'

export interface DaySpend {
  /** UTC date, as YYYY-MM-DD. */
  day: string
  requests: number
  inputTokens: number
}

export interface Ceilings {
  dailyTokens: number
  dailyRequests: number
}

export const emptyDay = (day: string): DaySpend => ({
  day, requests: 0, inputTokens: 0,
})

/** The UTC day a moment falls in, which is the day the ceiling is kept by. */
export const dayOf = (at: Date): string => at.toISOString().slice(0, 10)

/**
 * The ceiling in tokens, derived from what the deployment will spend and what
 * a token costs. FR-134 makes the price a deployment setting, so writing a
 * token count down directly would go quietly wrong the day the price moves.
 *
 * The request ceiling is separate because many small calls cost as much against
 * the published rate limit as a few large ones.
 */
export function ceilingsFor(o: {
  dailyBudgetUsd: number
  pricePerMillionTokens: number
  /** Defaults to roughly one request per two thousand tokens, as measured. */
  dailyRequests?: number
}): Ceilings {
  const tokens = o.pricePerMillionTokens > 0
    ? Math.floor((o.dailyBudgetUsd / o.pricePerMillionTokens) * 1_000_000)
    : 0
  return {
    dailyTokens: Math.max(0, tokens),
    dailyRequests: o.dailyRequests ?? Math.max(0, Math.floor(tokens / 2_000)),
  }
}

/** What a run may spend from here, given what the day has already used. */
export function grant(
  spent: DaySpend, ceilings: Ceilings, today: string,
): Allowance {
  const used = spent.day === today ? spent : emptyDay(today)
  const tokensLeft = ceilings.dailyTokens - used.inputTokens
  const requestsLeft = ceilings.dailyRequests - used.requests
  if (tokensLeft <= 0 || requestsLeft <= 0) {
    return { tokens: 0, degraded: true, reason: 'global_budget' }
  }
  // Only what is actually left, so one long run cannot overshoot the day in a
  // single chunk's allowance.
  return { tokens: tokensLeft, degraded: false }
}

/** The day's total after a run reports what a chunk used. */
export function record(
  spent: DaySpend, used: { requests: number; inputTokens: number }, today: string,
): DaySpend {
  const base = spent.day === today ? spent : emptyDay(today)
  return {
    day: today,
    requests: base.requests + used.requests,
    inputTokens: base.inputTokens + used.inputTokens,
  }
}
