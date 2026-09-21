// What this deployment allows, as distinct from what the engine allows.
//
// The engine permits up to 20,000 turns. That is fine on a laptop and a lot to
// ask of a shared machine anyone with the link can start work on: with Jev
// deciding, six turns a second makes 20,000 turns nearly an hour of one slot.
// So the deployment carries its own, lower ceiling.
//
// Enforced where a run is created, not only offered in the form. A form is a
// suggestion; the request is what counts.

import { TICK_RANGE, type ValidationError } from '@jev-mice/engine'

/** The ceiling for this deployment, clamped to what the engine can do. */
export function tickCeiling(env: { MAX_TICKS?: string }): number {
  const asked = Number(env.MAX_TICKS)
  if (!Number.isFinite(asked)) return TICK_RANGE.max
  return Math.min(TICK_RANGE.max, Math.max(TICK_RANGE.min, Math.floor(asked)))
}

/** The error for a run that is too long, or null if it is not. */
export function tooManyTicks(ticks: number, ceiling: number): ValidationError | null {
  if (!Number.isFinite(ticks) || ticks <= ceiling) return null
  return {
    field: 'ticks',
    code: 'out_of_range',
    message: `This deployment runs at most ${ceiling.toLocaleString('en-US')} turns; `
      + `this asks for ${ticks.toLocaleString('en-US')}.`,
  }
}
