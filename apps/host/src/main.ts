// The entry point. Loads .env, reads the key from the environment rather than
// from anything it might serve, and says plainly whether decisions will be
// judged or computed.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createHost } from './server.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..', '..')

// Node reads the file itself, so there is no dependency and nothing that could
// log the contents. A missing .env is normal, not an error.
const envFile = process.env.JEV_MICE_ENV ?? join(repoRoot, '.env')
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile)
  } catch {
    process.stderr.write(`could not read ${envFile}; continuing with the environment as it is\n`)
  }
}

const apiKey = process.env.TYPESAFE_API_KEY?.trim() || null
const port = Number(process.env.PORT ?? 8787)

const host = createHost({
  port,
  root: process.env.JEV_MICE_DATA ?? join(repoRoot, '.data'),
  webRoot: process.env.JEV_MICE_WEB ?? join(repoRoot, 'apps', 'web', 'dist'),
  maxConcurrent: Number(process.env.JEV_MICE_MAX_RUNS ?? 4),
  apiKey,
})

const { port: bound } = await host.listen()
process.stdout.write(
  `jev-mice listening on http://localhost:${String(bound)}\n` +
  `decisions: ${apiKey === null
    ? 'fixed rules only (set TYPESAFE_API_KEY in .env to offer Jev)'
    : 'Jev or the fixed rules, chosen per run'}\n`)
