// What the configuration screen says about a run's chances before it starts.
//
// The figure is looked up, never computed here: a single run takes seconds and
// an honest estimate needs dozens, so the numbers come from a sweep that ran
// offline. It moves with the tick count as well as the knobs, because
// extinction is late -- every configuration measured survives eight hundred
// turns, and they only separate after eighteen hundred.

import { estimateSurvival, SURVIVAL_TABLE, type RunConfig } from '@jev-mice/engine'
import { oddsWording, type OddsTone } from './odds.js'

const TONE: Record<OddsTone, string> = {
  safe: 'border-emerald-700/60 bg-emerald-950/30 text-emerald-200',
  likely: 'border-sky-700/60 bg-sky-950/30 text-sky-200',
  even: 'border-amber-700/60 bg-amber-950/30 text-amber-200',
  doomed: 'border-red-800/60 bg-red-950/30 text-red-200',
  unknown: 'border-zinc-700 bg-zinc-900/50 text-zinc-400',
}

export function OddsPanel({ config, decider }: {
  config: RunConfig
  decider: 'jev' | 'rules'
}): React.ReactElement {
  const estimate = estimateSurvival(config, SURVIVAL_TABLE)
  const { headline, detail, tone } = oddsWording(estimate)

  return (
    <div
      aria-live="polite"
      className={`rounded border p-2 text-xs leading-snug ${TONE[tone]}`}
    >
      <div className="font-medium">{headline}</div>
      <p className="mt-1 text-[11px] opacity-80">{detail}</p>
      {decider === 'jev' && estimate !== null && (
        // The sweep ran the rules, which are deterministic. Jev is not, so the
        // figure is a reference point for this world rather than a forecast of
        // the run about to start.
        <p className="mt-1 text-[11px] opacity-80">
          Measured with the rules deciding. Jev does not decide the same way
          twice, so treat this as what the world does on its own, not as a
          prediction of this run.
        </p>
      )}
    </div>
  )
}
