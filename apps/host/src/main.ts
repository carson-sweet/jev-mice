// The entry point. Reads the key from the environment, never from a file it
// might serve, and says plainly whether decisions will be judged or computed.

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHost } from './server.js'

const here = dirname(fileURLToPath(import.meta.url))
const apiKey = process.env.TYPESAFE_API_KEY ?? null
const port = Number(process.env.PORT ?? 8787)

const host = createHost({
  port,
  root: process.env.JEV_MICE_DATA ?? join(here, '..', '..', '..', '.data'),
  webRoot: process.env.JEV_MICE_WEB ?? join(here, '..', '..', 'web', 'dist'),
  maxConcurrent: Number(process.env.JEV_MICE_MAX_RUNS ?? 4),
  apiKey,
})

const { port: bound } = await host.listen()
process.stdout.write(
  `jev-mice listening on http://localhost:${String(bound)}\n` +
  `decisions: ${apiKey === null
    ? 'fixed rules (set TYPESAFE_API_KEY to have Jev judge them)'
    : 'Jev'}\n`)
