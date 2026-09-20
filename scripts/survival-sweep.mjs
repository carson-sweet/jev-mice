// Measures how often an ecosystem outlives a given number of turns.
//
// The engine is deterministic, so "chance of survival" is not a metaphor: for
// one configuration it is exactly the fraction of seeds whose mice are still
// alive at the horizon. This sweeps a grid of configurations and records, for
// each seed, the turn the last mouse died -- not merely whether it survived.
// Survival at any horizon is then read back off that one number, so a single
// sweep answers the question for every tick count the user can set. That
// matters because extinction is late: every configuration measured survives
// 800 turns, and they only separate after 1800.
//
//   node scripts/survival-sweep.mjs [--seeds 16] [--ticks 4000] [--workers 8]
//
// Writes packages/engine/src/survival-table.json.

import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { cpus } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(process.argv[i + 1])
}
const SEED_COUNT = arg('seeds', 16)
const TICKS = arg('ticks', 4000)
const WORKERS = arg('workers', Math.max(1, Math.min(8, cpus().length - 2)))

/** Fixed seeds, so re-running the sweep reproduces the table exactly. */
export const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 1000 + i * 37)

/**
 * The axes the outcome actually turns on, measured rather than assumed.
 * Mouseholes and cats dominate; food supply and its respawn rate are the next
 * two. Traps barely moved the result, so they are held at the preset default
 * rather than spending a fourfold increase in runs on them.
 */
export const AXES = {
  cats: [0, 1, 2, 3, 4],
  mouseholes: [8, 12, 16, 20, 24, 32],
  foodPiles: [20, 40, 60, 80],
  foodRespawnTicks: [60, 110, 180],
}

/** Held constant across the grid; the table is only honest for these. */
export const HELD = {
  nutritionDecayPerTick: 0.3,
  startingNutrition: 100,
  personality: { bold: 25, cautious: 25, vigilant: 25, social: 25 },
}

export const FIXED_PER_PRESET = {
  small: { traps: 4, maleMice: 15, femaleMice: 15 },
  medium: { traps: 8, maleMice: 30, femaleMice: 30 },
  large: { traps: 8, maleMice: 30, femaleMice: 30 },
}

// Mirrors capsFor in packages/engine/src/config.ts. Duplicated rather than
// imported so this script stays runnable as plain node without a loader.
const CAPS = Object.fromEntries(Object.entries({
  small: [48, 32], medium: [80, 50], large: [120, 75],
}).map(([k, [w, h]]) => [k, {
  mice: Math.floor(w * h / 25), food: Math.floor(w * h / 50),
  mouseholes: Math.floor(w * h / 50), traps: Math.floor(w * h / 100),
  cats: Math.floor(w * h / 400),
}]))

if (process.env.SWEEP_WORKER) {
  const { createEngine, baselineProvider } = await import(
    resolve(ROOT, 'packages/engine/src/index.ts'))
  process.on('message', async (job) => {
    if (job === 'done') { process.exit(0); return }
    const e = createEngine({
      config: { ...job.config, ticks: 20000 },
      seed: job.seed,
      provider: baselineProvider(),
    })
    // The turn the last mouse died, or null if they outlived the horizon.
    let died = null
    for (let t = 1; t <= job.ticks; t++) {
      await e.step()
      if (e.world().mice.length === 0) { died = t; break }
    }
    process.send({ key: job.key, seed: job.seed, died })
  })
} else if (process.argv[1] !== undefined
    && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Only when run directly. Importing this file for emit() must not start a
  // sweep, which it did once -- thirteen thousand runs from a one-line import.
  await main()
}

function* cells() {
  for (const preset of ['small', 'medium', 'large']) {
    const caps = CAPS[preset]
    const seen = new Set()
    for (const cats of AXES.cats) {
      for (const mouseholes of AXES.mouseholes) {
        for (const foodPiles of AXES.foodPiles) {
          for (const foodRespawnTicks of AXES.foodRespawnTicks) {
            // Clamped, because the small map cannot hold 80 food piles and an
            // out-of-cap cell would be a row the configuration screen can
            // never reach. Clamping collapses cells, hence the dedupe.
            const cell = {
              cats: Math.min(cats, caps.cats),
              mouseholes: Math.min(mouseholes, caps.mouseholes),
              foodPiles: Math.min(foodPiles, caps.food),
              foodRespawnTicks,
            }
            const key = [preset, cell.cats, cell.mouseholes,
              cell.foodPiles, cell.foodRespawnTicks].join('/')
            if (seen.has(key)) continue
            seen.add(key)
            yield { preset, key, cell }
          }
        }
      }
    }
  }
}

async function main() {
  const jobs = []
  const table = {}
  for (const { preset, key, cell } of cells()) {
    table[key] = { preset, ...cell, diedAt: [] }
    for (const seed of SEEDS) {
      jobs.push({ key, seed, ticks: TICKS,
        config: { preset, ...HELD, ...FIXED_PER_PRESET[preset], ...cell } })
    }
  }
  const total = jobs.length
  process.stderr.write(`${Object.keys(table).length} cells, ${total} runs, ${WORKERS} workers\n`)

  let issued = 0
  let done = 0
  const started = Date.now()
  await new Promise((finish) => {
    const pool = Array.from({ length: WORKERS }, () => {
      const w = fork(fileURLToPath(import.meta.url), process.argv.slice(2), {
        env: { ...process.env, SWEEP_WORKER: '1', NODE_OPTIONS: '--import tsx' },
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      })
      w.on('message', (r) => {
        table[r.key].diedAt.push([r.seed, r.died])
        done++
        if (done % 200 === 0 || done === total) {
          const rate = done / ((Date.now() - started) / 1000)
          process.stderr.write(`  ${done}/${total}  ${rate.toFixed(1)}/s  ` +
            `~${Math.round((total - done) / rate / 60)} min left\n`)
        }
        if (issued < total) w.send(jobs[issued++])
        else { w.send('done'); if (done === total) finish() }
      })
      return w
    })
    for (const w of pool) if (issued < total) w.send(jobs[issued++])
  })

  // Sorted so the file is stable across runs and a diff is readable.
  for (const row of Object.values(table)) row.diedAt.sort((a, b) => a[0] - b[0])
  const out = {
    measuredAt: new Date().toISOString().slice(0, 10),
    ticks: TICKS,
    seeds: SEEDS,
    held: HELD,
    fixedPerPreset: FIXED_PER_PRESET,
    axes: AXES,
    // Each cell keeps one number per seed: the turn its last mouse died, or
    // null if it outlived the sweep. Survival at any horizon counts the seeds
    // whose number is null or greater than that horizon.
    cells: Object.values(table).map((r) => ({
      preset: r.preset, cats: r.cats, mouseholes: r.mouseholes,
      foodPiles: r.foodPiles, foodRespawnTicks: r.foodRespawnTicks,
      diedAt: r.diedAt.map(([, d]) => d),
    })),
  }
  const path = resolve(ROOT, 'packages/engine/src/survival-table.ts')
  writeFileSync(path, emit(out))
  process.stderr.write(`wrote ${path}\n`)
}

/**
 * Emitted as TypeScript rather than JSON so the table is type-checked with the
 * rest of the engine and needs no bundler JSON support. Generated -- edit the
 * sweep, not this output.
 */
export function emit(out) {
  return `// Generated by scripts/survival-sweep.mjs on ${out.measuredAt}. Do not edit.
//
// How often an ecosystem outlives a given number of turns, measured rather
// than modelled. Each cell holds one number per seed: the turn its last mouse
// died, or null if it outlived the sweep. Survival at any horizon counts the
// seeds whose number is null or greater than that horizon.

import type { SurvivalTable } from './survival.js'

export const SURVIVAL_TABLE: SurvivalTable = ${JSON.stringify(out)}
`
}
