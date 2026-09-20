// The report and the data dump for a run that has finished.
//
// Both read the run's stored chunks rather than recomputing anything: every
// event and every turn's counts were made durable as the run went. The two
// behavioural measures come from the engine's own reducers, so the number in a
// report and the number in a test cannot disagree.

import { readFile } from 'node:fs/promises'
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { fleeOrHideRate, personalityMix, type SimEvent } from '@jev-mice/engine'
import type { ChunkBody, RunSummary } from '@jev-mice/sim'
import type { StoredRun } from './turns.js'

const unzip = promisify(gunzip)

export interface ReportSource {
  run: RunSummary
  stored: StoredRun
}

/** A measure with its numbers and, where there is enough evidence, a verdict. */
export interface Measured {
  id: string
  asks: string
  applies: boolean
  verdict: 'met' | 'not met' | 'not enough evidence'
  threshold: number
  [k: string]: unknown
}

export interface Report {
  runId: string
  seed: number
  createdAt: string
  config: RunSummary['config']
  decidedBy: RunSummary['decidedBy']
  endReason: RunSummary['endReason']
  turns: number
  ofTurns: number
  population: RunSummary['population']
  deaths: { starvation: number; cat: number; trap: number }
  births: number
  catsStarved: number
  decisions: { judged: number; computed: number; inputTokens: number }
  measures: { fleeOrHide: Measured; personalityMix: Measured }
}

/** Every event of a run, chunk by chunk, so nothing holds the whole record. */
async function* events(source: ReportSource): AsyncGenerator<SimEvent[]> {
  for (const c of source.stored.chunks) {
    let raw: Buffer
    try {
      raw = await readFile(source.stored.chunkPath(c.seq))
    } catch {
      // A chunk that never made it to storage leaves a gap rather than a
      // failure: a report of most of a run is worth more than none of it.
      continue
    }
    const body = JSON.parse((await unzip(raw)).toString('utf8')) as ChunkBody
    yield body.events
  }
}

const verdictFor = (applies: boolean, met: boolean): Measured['verdict'] =>
  !applies ? 'not enough evidence' : met ? 'met' : 'not met'

export async function buildReport(source: ReportSource): Promise<Report> {
  const deaths = { starvation: 0, cat: 0, trap: 0 }
  let births = 0
  let catsStarved = 0

  // One pass for the tallies, and one reducer pass each for the two measures.
  for await (const batch of events(source)) {
    for (const e of batch) {
      if (e.kind === 'death') deaths[e.cause]++
      else if (e.kind === 'birth') births++
      else if (e.kind === 'cat_died') catsStarved++
    }
  }

  const flee = await fleeOrHideRate(events(source))
  const mix = await personalityMix(events(source), source.run.config)

  const fleeRate = typeof flee.rate === 'number' ? flee.rate : null
  const worst = typeof mix.worstDelta === 'number' ? mix.worstDelta : null

  return {
    runId: source.run.id,
    seed: source.run.seed,
    createdAt: source.run.createdAt,
    config: source.run.config,
    decidedBy: source.run.decidedBy,
    endReason: source.run.endReason,
    turns: source.run.currentTick,
    ofTurns: source.run.config.ticks,
    population: source.run.population,
    deaths,
    births,
    catsStarved,
    decisions: {
      judged: source.run.totals.requests,
      computed: source.run.totals.fallbackCount,
      inputTokens: source.run.totals.inputTokens,
    },
    measures: {
      fleeOrHide: {
        ...flee,
        id: 'SM-07',
        asks: 'Of mice outside a hole with a cat very close and nutrition at or '
          + 'above 60 percent, at least 80 percent of drive decisions put a '
          + 'combined 0.5 or more on flee plus hide.',
        verdict: verdictFor(flee.applies, fleeRate !== null && fleeRate >= flee.threshold),
      },
      personalityMix: {
        ...mix,
        id: 'SM-06',
        asks: "Over a run reaching 1,000 or more mice ever alive, each "
          + "personality's share is within 5 points of its configured percentage.",
        verdict: verdictFor(mix.applies, worst !== null && worst <= mix.threshold),
      },
    },
  }
}

const pct = (n: number | null): string =>
  n === null ? 'no reading' : `${String(Math.round(n * 1000) / 10)} percent`

/** A document a person can keep. Markdown, no emoji, no process vocabulary. */
export function renderReport(r: Report): string {
  const c = r.config
  const flee = r.measures.fleeOrHide
  const mix = r.measures.personalityMix
  const ended = r.endReason === 'extinct'
    ? `Total extinction at turn ${String(r.turns)}: nothing was left alive.`
    : r.endReason === 'stopped'
      ? `Stopped by hand at turn ${String(r.turns)} of ${String(r.ofTurns)}.`
      : `Ran its full ${String(r.ofTurns)} turns.`

  return `# jev-mice run ${r.runId}

${new Date(r.createdAt).toISOString()} · seed ${String(r.seed)} · decided by ${
    r.decidedBy === 'jev' ? 'Jev' : 'the fixed rules'}

${ended}

## What it started from

| Setting | Value |
|---|---|
| World | ${c.preset}, ${String(c.ticks)} turns |
| Mice | ${String(c.maleMice)} male, ${String(c.femaleMice)} female |
| Cats | ${String(c.cats)} |
| Traps | ${String(c.traps)} |
| Food piles | ${String(c.foodPiles)}, respawning every ${String(c.foodRespawnTicks)} turns |
| Mouseholes | ${String(c.mouseholes)} |
| Nutrition decay | ${String(c.nutritionDecayPerTick)} a turn |
| Personality | bold ${String(c.personality.bold)}, cautious ${
    String(c.personality.cautious)}, vigilant ${String(c.personality.vigilant)}, social ${
    String(c.personality.social)} |

Running the same seed with the same settings reproduces this run exactly.

## What became of them

| Measure | Value |
|---|---|
| Mice, highest then lowest then final | ${String(r.population.mice.peak)}, ${
    String(r.population.mice.min)}, ${String(r.population.mice.current)} |
| Cats, highest then lowest then final | ${String(r.population.cats.peak)}, ${
    String(r.population.cats.min)}, ${String(r.population.cats.current)} |
| Births | ${String(r.births)} |
| Died of hunger | ${String(r.deaths.starvation)} |
| Caught by a cat | ${String(r.deaths.cat)} |
| Died in a trap | ${String(r.deaths.trap)} |
| Cats starved | ${String(r.catsStarved)} |
| Decisions judged by Jev | ${String(r.decisions.judged)} |
| Decisions computed by the rules | ${String(r.decisions.computed)} |
| Input tokens | ${String(r.decisions.inputTokens)} |

## The two behavioural measures

### ${flee.id}: ${flee.verdict}

${flee.asks}

Qualifying decisions ${String(flee.qualifying)}, of which ${String(flee.passing)} passed, a rate of ${
    pct(typeof flee.rate === 'number' ? flee.rate : null)} against a threshold of ${
    pct(flee.threshold)}.${flee.applies
      ? ''
      : ` A verdict needs 100 qualifying decisions and this run produced ${
        String(flee.qualifying)}, so the rate is reported without one.`}

### ${mix.id}: ${mix.verdict}

${mix.asks}

${String(mix.everAlive)} mice were ever alive. The widest gap between a personality's share and its configured percentage was ${
    typeof mix.worstDelta === 'number'
      ? `${String(Math.round(mix.worstDelta * 100) / 100)} points`
      : 'not measurable'} against a threshold of ${String(mix.threshold)}.${mix.applies
      ? ''
      : ' A verdict needs 1,000 mice ever alive, so the gap is reported without one.'}
`
}

/**
 * The whole record as JSON lines: one object of metadata, then one per event.
 * A line at a time so memory stays flat over a long run, and a format that can
 * be filtered without a parser holding the lot.
 */
export async function* exportLines(source: ReportSource): AsyncGenerator<string> {
  const r = source.run
  yield `${JSON.stringify({
    kind: 'run',
    id: r.id,
    seed: r.seed,
    createdAt: r.createdAt,
    config: r.config,
    decidedBy: r.decidedBy,
    endReason: r.endReason,
    turns: r.currentTick,
    population: r.population,
    totals: r.totals,
  })}\n`

  for await (const batch of events(source)) {
    for (const e of batch) yield `${JSON.stringify(e)}\n`
  }
}
