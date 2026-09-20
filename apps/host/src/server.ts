// The local host. It serves the viewer, creates runs, and holds the sockets a
// viewer watches through. The decision key is read here and never sent to a
// browser: everything the page receives has already been decided.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { WebSocketServer } from 'ws'
import { defaultConfig, validateConfig, type RunConfig } from '@jev-mice/engine'
import { SPEED } from '@jev-mice/sim'
import { createRunManager, type Decider, type RunManager, type ViewerMessage } from './runs.js'
import { turnWindow, MAX_WINDOW } from './turns.js'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.gz': 'application/gzip',
}

export interface HostOptions {
  port: number
  root: string
  webRoot: string
  maxConcurrent: number
  apiKey: string | null
}

const json = (res: ServerResponse, status: number, body: unknown): void => {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // Nothing here is for anyone but the person who asked for it.
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(text)
}

const readBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > 64 * 1024) throw new Error('request too large')
    chunks.push(c as Buffer)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createHost(opts: HostOptions): {
  manager: RunManager
  listen(): Promise<{ port: number; close(): Promise<void> }>
} {
  const manager = createRunManager({
    root: opts.root, maxConcurrent: opts.maxConcurrent, apiKey: opts.apiKey,
  })

  const server = createServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      json(res, 500, { error: err instanceof Error ? err.message : 'failed' })
    })
  })

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const method = req.method ?? 'GET'

    if (path === '/api/capabilities') {
      // What the page is allowed to offer. It never learns the key itself,
      // only whether one exists.
      return json(res, 200, {
        jevAvailable: manager.jevAvailable,
        speed: { slowest: SPEED.slowest, fastest: SPEED.fastest },
      })
    }

    if (path === '/api/config/defaults') {
      const preset = url.searchParams.get('preset') ?? 'medium'
      if (preset !== 'small' && preset !== 'medium' && preset !== 'large') {
        return json(res, 400, { error: 'unknown preset' })
      }
      return json(res, 200, { config: defaultConfig(preset) })
    }

    if (path === '/api/runs' && method === 'GET') {
      return json(res, 200, { runs: manager.list() })
    }

    if (path === '/api/runs' && method === 'POST') {
      const body = await readBody(req) as {
        config?: RunConfig; seed?: number; decider?: string; speed?: number
      }
      if (!body.config) return json(res, 400, { error: 'a configuration is required' })
      const errors = validateConfig(body.config)
      if (errors.length > 0) return json(res, 400, { errors })
      if (body.decider !== undefined && body.decider !== 'jev' && body.decider !== 'rules') {
        return json(res, 400, { error: 'decider must be jev or rules' })
      }
      const seed = Number.isFinite(body.seed) ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31)
      try {
        return json(res, 201, { run: manager.create({
          config: body.config,
          seed,
          ...(body.decider === undefined ? {} : { decider: body.decider as Decider }),
          ...(body.speed === undefined ? {} : { speed: body.speed }),
        }) })
      } catch (err) {
        return json(res, 400, { error: err instanceof Error ? err.message : 'could not start' })
      }
    }

    const run = /^\/api\/runs\/([^/]+)(\/.*)?$/.exec(path)
    if (run) {
      const id = run[1] ?? ''
      const rest = run[2] ?? ''
      const state = manager.get(id)
      if (!state) return json(res, 404, { error: 'no such run' })

      if (rest === '' && method === 'GET') return json(res, 200, { run: state })

      if (rest === '/control' && method === 'POST') {
        const body = await readBody(req) as { action?: string; speed?: number }
        const action = body.action
        if (action === 'speed') {
          if (!Number.isFinite(body.speed)) {
            return json(res, 400, { error: 'a speed in ticks a second is required' })
          }
          const ok = manager.setSpeed(id, Number(body.speed))
          return json(res, ok ? 200 : 409, { run: manager.get(id) })
        }
        if (action !== 'pause' && action !== 'resume' && action !== 'step' && action !== 'stop') {
          return json(res, 400, { error: 'unknown action' })
        }
        const ok = manager.control(id, action)
        return json(res, ok ? 200 : 409, { run: manager.get(id) })
      }

      if (rest === '/turns' && method === 'GET') {
        const from = Number(url.searchParams.get('from') ?? 1)
        const to = Number(url.searchParams.get('to') ?? from + 49)
        if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
          return json(res, 400, { error: 'from and to must be turn numbers, from first' })
        }
        if (to - from + 1 > MAX_WINDOW) {
          return json(res, 400, {
            error: `at most ${String(MAX_WINDOW)} turns at a time; ask for a smaller window`,
          })
        }
        const window = turnWindow({
          chunks: state.chunks,
          chunkPath: (seq) => manager.chunkPath(id, seq) ?? '',
          summaryPath: (seq) => manager.summaryPath(id, seq) ?? '',
          totalTurns: state.currentTick,
        }, from, to)
        return json(res, 200, { ...window, runId: id })
      }

      const chunk = /^\/chunks\/(\d+)$/.exec(rest)
      if (chunk && method === 'GET') {
        const file = manager.chunkPath(id, Number(chunk[1]))
        return file ? sendFile(res, file) : json(res, 404, { error: 'no such chunk' })
      }
      const summary = /^\/summary\/(\d+)$/.exec(rest)
      if (summary && method === 'GET') {
        const file = manager.summaryPath(id, Number(summary[1]))
        return file ? sendFile(res, file) : json(res, 404, { error: 'no such summary' })
      }
      return json(res, 404, { error: 'no such route' })
    }

    if (path.startsWith('/api/')) return json(res, 404, { error: 'no such route' })
    return serveStatic(res, path)
  }

  function sendFile(res: ServerResponse, file: string): void {
    const body = readFileSync(file)
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'private, max-age=31536000, immutable',
    })
    res.end(body)
  }

  function serveStatic(res: ServerResponse, path: string): void {
    // Normalized and confined to the web root, so a dotted path cannot climb out.
    const wanted = normalize(join(opts.webRoot, path === '/' ? '/index.html' : path))
    if (!wanted.startsWith(normalize(opts.webRoot))) {
      return json(res, 403, { error: 'forbidden' })
    }
    const file = existsSync(wanted) && statSync(wanted).isFile()
      ? wanted
      : join(opts.webRoot, 'index.html')
    if (!existsSync(file)) return json(res, 404, { error: 'not built' })
    const body = readFileSync(file)
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  }

  const sockets = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const match = /^\/api\/runs\/([^/]+)\/stream$/.exec(url.pathname)
    if (!match) { socket.destroy(); return }
    const id = match[1] ?? ''
    sockets.handleUpgrade(req, socket, head, (ws) => {
      const send = (m: ViewerMessage): void => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
      }
      const stop = manager.watch(id, send)
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as
            { t?: string; action?: string; speed?: number }
          if (msg.t === 'control' && typeof msg.action === 'string') {
            const a = msg.action
            if (a === 'speed' && Number.isFinite(msg.speed)) manager.setSpeed(id, Number(msg.speed))
            else if (a === 'pause' || a === 'resume' || a === 'step' || a === 'stop') {
              manager.control(id, a)
            }
          }
        } catch { /* a malformed message is ignored, never fatal */ }
      })
      ws.on('close', stop)
      ws.on('error', stop)
    })
  })

  return {
    manager,
    listen: () => new Promise((resolve) => {
      server.listen(opts.port, () => {
        const addr = server.address()
        const port = typeof addr === 'object' && addr !== null ? addr.port : opts.port
        resolve({
          port,
          close: () => new Promise((done) => {
            sockets.clients.forEach((c) => { c.terminate() })
            server.close(() => { done() })
          }),
        })
      })
    }),
  }
}
