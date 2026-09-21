// One of these for the whole deployment. It holds the day's Jev spend and
// hands out allowances, so a public URL with no accounts cannot run up an
// unbounded bill. The decision it makes is in budget.ts and is tested there;
// this is the durable wrapper around it.

import { ceilingsFor, dayOf, emptyDay, grant, record, type DaySpend } from './budget.js'
import { numberFrom, type Env } from './env.js'

const KEY = 'spend'

export class BudgetDO implements DurableObject {
  readonly #storage: DurableObjectStorage
  readonly #env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.#storage = state.storage
    this.#env = env
  }

  #ceilings(): ReturnType<typeof ceilingsFor> {
    return ceilingsFor({
      dailyBudgetUsd: numberFrom(this.#env.JEV_DAILY_BUDGET_USD, 20),
      // TypeSafe's published price, read from docs.typesafe.ai/models on
      // 2026-09-21: $42 per Btok, $0.042 per Mtok, input only, output free.
      pricePerMillionTokens: numberFrom(this.#env.JEV_PRICE_PER_MTOK, 0.042),
    })
  }

  async #spend(): Promise<DaySpend> {
    return await this.#storage.get<DaySpend>(KEY) ?? emptyDay(dayOf(new Date()))
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    const today = dayOf(new Date())
    const spent = await this.#spend()

    if (pathname === '/grant') {
      return Response.json(grant(spent, this.#ceilings(), today))
    }
    if (pathname === '/record') {
      const used = await request.json<{ requests: number; inputTokens: number }>()
      const after = record(spent, used, today)
      await this.#storage.put(KEY, after)
      return Response.json(after)
    }
    if (pathname === '/state') {
      return Response.json({
        spent: spent.day === today ? spent : emptyDay(today),
        ceilings: this.#ceilings(),
      })
    }
    return new Response('no such route', { status: 404 })
  }
}
