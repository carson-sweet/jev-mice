// The public deployment pays for every Jev call any visitor causes, so the
// budget is the thing standing between a shared link and a surprise bill.
//
// Its job is not to refuse. Past the ceiling a run still runs, decided by the
// fixed rules, and the page says why -- a site that keeps working on the
// cheaper path is better than one that turns visitors away.

import { describe, it, expect } from 'vitest'
import { emptyDay, grant, record, ceilingsFor } from '../src/budget.js'

const LIMITS = { dailyTokens: 100_000, dailyRequests: 1_000 }

describe('The daily ceiling on what Jev may be asked', () => {
  it('Lets a run use Jev while there is budget left', () => {
    const day = emptyDay('2026-09-20')
    const a = grant(day, LIMITS, '2026-09-20')
    expect(a.degraded).toBe(false)
    expect(a.tokens).toBeGreaterThan(0)
  })

  it('Never grants more than is left, so one run cannot spend the day', () => {
    const day = { ...emptyDay('2026-09-20'), inputTokens: 90_000 }
    expect(grant(day, LIMITS, '2026-09-20').tokens).toBe(10_000)
  })

  it('Falls back to the rules once the tokens are gone, and says why', () => {
    const day = { ...emptyDay('2026-09-20'), inputTokens: 100_000 }
    const a = grant(day, LIMITS, '2026-09-20')
    expect(a).toMatchObject({ tokens: 0, degraded: true, reason: 'global_budget' })
  })

  it('Falls back on the request count too, not only the tokens', () => {
    // Many cheap calls cost as much in rate limit as a few large ones, and the
    // published limit is in requests a minute rather than tokens.
    const day = { ...emptyDay('2026-09-20'), requests: 1_000 }
    expect(grant(day, LIMITS, '2026-09-20')).toMatchObject({
      degraded: true, reason: 'global_budget',
    })
  })

  it('Starts again on a new day without anyone resetting it', () => {
    // The ceiling is read against the day it was recorded for, so a missed
    // alarm cannot leave yesterday's spend standing in front of today's runs.
    const spent = { day: '2026-09-20', requests: 1_000, inputTokens: 100_000 }
    expect(grant(spent, LIMITS, '2026-09-21').degraded).toBe(false)
  })

  it('Counts what a run reports it used', () => {
    const day = emptyDay('2026-09-20')
    const after = record(day, { requests: 12, inputTokens: 3_400 }, '2026-09-20')
    expect(after).toMatchObject({ requests: 12, inputTokens: 3_400 })
  })

  it('Drops yesterday’s total when the first report of a new day lands', () => {
    const spent = { day: '2026-09-20', requests: 900, inputTokens: 90_000 }
    expect(record(spent, { requests: 5, inputTokens: 100 }, '2026-09-21'))
      .toEqual({ day: '2026-09-21', requests: 5, inputTokens: 100 })
  })

  it('Turns a dollar ceiling and a token price into a token ceiling', () => {
    // The price is a deployment setting by FR-134, so the ceiling has to be
    // derived rather than written down as a token count that quietly goes
    // wrong when the price changes. It already did once: 0.28 was a guess and
    // 6.7 times too high, so a $20 ceiling behaved like $3.
    const c = ceilingsFor({ dailyBudgetUsd: 20, pricePerMillionTokens: 0.042 })
    expect(c.dailyTokens).toBe(Math.floor((20 / 0.042) * 1_000_000))
  })

  it('Buys what TypeSafe\u2019s published price says it buys', () => {
    // $0.042 per Mtok, input only, from docs.typesafe.ai/models. A full default
    // run on the medium world measures about 4.83M input tokens, so $20 a day
    // is roughly a hundred of them. If this number collapses, the price in the
    // deployment settings has drifted from the published one.
    const c = ceilingsFor({ dailyBudgetUsd: 20, pricePerMillionTokens: 0.042 })
    const runsPerDay = c.dailyTokens / 4.83e6
    expect(runsPerDay).toBeGreaterThan(80)
    expect(runsPerDay).toBeLessThan(120)
  })

  it('Refuses Jev outright when the budget is set to nothing', () => {
    const c = ceilingsFor({ dailyBudgetUsd: 0, pricePerMillionTokens: 0.28 })
    expect(grant(emptyDay('2026-09-20'), c, '2026-09-20')).toMatchObject({
      degraded: true, reason: 'global_budget',
    })
  })
})
