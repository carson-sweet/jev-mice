// Everything the page knows about the server. The page never decides anything
// and never holds a key; it asks for runs and draws what arrives.

import type { RunConfig, Preset } from '@jev-mice/engine'
import type { Frame } from '@jev-mice/sim'

export interface RunSummary {
  id: string
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  createdAt: string
  seed: number
  config: RunConfig
  currentTick: number
  queuePosition: number | null
  chunks: { seq: number; firstTick: number; lastTick: number; bytesGzip: number }[]
  totals: { currentTick: number; requests: number; inputTokens: number; fallbackCount: number }
  error: string | null
  decidedBy: 'jev' | 'rules'
}

export type ViewerMessage =
  | { t: 'hello'; run: RunSummary; frame: Frame | null }
  | { t: 'frame'; frame: Frame }
  | { t: 'status'; run: RunSummary }
  | { t: 'error'; message: string }

async function body<T>(r: Response): Promise<T> {
  const parsed = await r.json() as T & { error?: string; errors?: { message: string }[] }
  if (!r.ok) {
    throw new Error(parsed.errors?.map((e) => e.message).join(' ') ?? parsed.error ?? 'request failed')
  }
  return parsed
}

export const api = {
  defaults: async (preset: Preset): Promise<RunConfig> =>
    (await body<{ config: RunConfig }>(await fetch(`/api/config/defaults?preset=${preset}`))).config,

  list: async (): Promise<RunSummary[]> =>
    (await body<{ runs: RunSummary[] }>(await fetch('/api/runs'))).runs,

  get: async (id: string): Promise<RunSummary> =>
    (await body<{ run: RunSummary }>(await fetch(`/api/runs/${id}`))).run,

  create: async (config: RunConfig, seed?: number): Promise<RunSummary> =>
    (await body<{ run: RunSummary }>(await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config, seed }),
    }))).run,

  control: async (id: string, action: 'pause' | 'resume' | 'step' | 'stop'): Promise<void> => {
    await body(await fetch(`/api/runs/${id}/control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    }))
  },
}

export function watchRun(id: string, on: (m: ViewerMessage) => void): () => void {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
  let socket: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | null = null

  const open = (): void => {
    if (closed) return
    socket = new WebSocket(`${scheme}://${location.host}/api/runs/${id}/stream`)
    socket.onmessage = (e) => { on(JSON.parse(String(e.data)) as ViewerMessage) }
    // A dropped socket reconnects rather than leaving the page frozen on an
    // old frame with no sign that anything is wrong.
    socket.onclose = () => { if (!closed) retry = setTimeout(open, 1000) }
  }
  open()

  return () => {
    closed = true
    if (retry !== null) clearTimeout(retry)
    socket?.close()
  }
}

export function sendControl(id: string, action: string): void {
  void api.control(id, action as 'pause').catch(() => undefined)
}
