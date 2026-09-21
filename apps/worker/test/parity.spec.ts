// The deployment must offer every route the laptop offers.
//
// This file exists because it was missing twice. The Worker's route surface was
// built from memory rather than from the host's, and both times something was
// quietly absent: first a speed change, which the page sent to /control and the
// Worker forwarded to an object that ignored it, and then /turns, /report,
// /report.md and /export, which the host has and the Worker simply never grew
// -- so the whole run-history page and every download on the deployment
// answered "no such route" while working perfectly on a laptop.
//
// One viewer talks to both. A route the viewer calls that exists in one and not
// the other is a bug that only appears in production, which is the worst place
// to find it.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import app from '../src/index.js'

/** Every /api path the viewer asks for, read out of the viewer's own client. */
function pathsTheViewerCalls(): string[] {
  const src = readFileSync(
    fileURLToPath(new URL('../../web/src/api.ts', import.meta.url)), 'utf8')
  const found = new Set<string>()
  for (const m of src.matchAll(/`?(\/api\/[^`'"\s)]*)/g)) {
    // Normalise the template holes into one shape.
    found.add((m[1] ?? '').replace(/\$\{[^}]*\}/g, ':id').replace(/\?.*$/, ''))
  }
  return [...found]
}

function stubEnv() {
  const stub = {
    fetch: vi.fn(async () => Response.json({ ok: true })),
  }
  const namespace = () => ({ idFromName: (n: string) => n, get: () => stub })
  return {
    RUN: namespace(), BUDGET: namespace(), REGISTRY: namespace(),
    RECORDS: {
      get: vi.fn(async () => ({
        body: new ReadableStream(),
        // Enough for a route to answer rather than 404 on a missing object.
      })),
      put: vi.fn(async () => undefined),
    },
    ASSETS: { fetch: vi.fn(async () => new Response('page')) },
    TYPESAFE_API_KEY: 'k',
  } as never
}

describe('The deployment offers what the laptop offers', () => {
  it('Answers every /api path the viewer is written to call', async () => {
    const paths = pathsTheViewerCalls()
    expect(paths.length).toBeGreaterThan(4)
    const missing: string[] = []
    for (const path of paths) {
      const url = path.replace(/:id/g, 'abc')
      // Tried both ways: some routes are POST-only, and a GET against one of
      // those is a fault in the probe rather than a missing route.
      let routed = false
      for (const method of ['GET', 'POST'] as const) {
        const res = await app.request(url, method === 'GET' ? {} : {
          method, headers: { 'content-type': 'application/json' }, body: '{}',
        }, stubEnv())
        const body = res.status === 404 ? await res.text() : ''
        if (!body.includes('no such route')) { routed = true; break }
      }
      if (!routed) missing.push(path)
    }
    expect(missing, `the deployment has no route for: ${missing.join(', ')}`).toEqual([])
  })

  it('Has the four telemetry routes the run history needs', async () => {
    // Named explicitly as well, because these are the ones that were missing
    // and a generic sweep is easy to weaken by accident.
    for (const path of ['/api/runs/abc/turns', '/api/runs/abc/report',
                        '/api/runs/abc/report.md', '/api/runs/abc/export']) {
      const res = await app.request(path, {}, stubEnv())
      const body = res.status === 404 ? await res.text() : ''
      expect(body, `${path} is not routed`).not.toContain('no such route')
    }
  })
})
