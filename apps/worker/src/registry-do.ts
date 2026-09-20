// The list behind "previous runs".
//
// Durable Objects cannot be enumerated, so something has to remember which runs
// exist. One singleton holding an ordered list is the smallest thing that does
// it: writes are serialised by the object itself, so two runs starting at once
// cannot lose each other, which a JSON file in R2 could.
//
// It holds a summary per run rather than only an id, so the list page renders
// from one request instead of one per row.

import type { RunSummary } from '@jev-mice/sim'

/** Newest first. Past this, the oldest finished run is dropped. */
const KEEP = 200
const KEY = 'runs'

export class RegistryDO implements DurableObject {
  readonly #storage: DurableObjectStorage

  constructor(state: DurableObjectState) {
    this.#storage = state.storage
  }

  async #list(): Promise<RunSummary[]> {
    return await this.#storage.get<RunSummary[]>(KEY) ?? []
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (pathname === '/list') {
      return Response.json({ runs: await this.#list() })
    }

    if (pathname === '/put') {
      const run = await request.json<RunSummary>()
      const runs = await this.#list()
      const at = runs.findIndex((r) => r.id === run.id)
      if (at === -1) runs.unshift(run)
      else runs[at] = run
      // Only a finished run may be dropped: a host busy with long runs should
      // refuse to forget work still in progress.
      while (runs.length > KEEP) {
        const victim = [...runs].reverse().find((r) =>
          r.status === 'completed' || r.status === 'failed' || r.status === 'cancelled')
        if (!victim) break
        runs.splice(runs.indexOf(victim), 1)
      }
      await this.#storage.put(KEY, runs)
      return Response.json({ ok: true })
    }

    return new Response('no such route', { status: 404 })
  }
}
