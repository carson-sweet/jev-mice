// Writing a batch's progress back without losing a control change.
//
// The alarm reads the summary when a batch starts and writes it back when the
// batch ends, and a batch can be a minute of wall time at a watchable pace.
// Anything changed in between -- a speed, a pause -- was inside the object it
// wrote back over. That is why the speed slider worked for a few seconds on the
// deployment and then snapped back to where it had been.
//
// The split: the batch owns progress, because only the batch knows how far it
// got. The control owns pace and intent, because only the request knows what
// was asked for. A batch may still end a run, because only the batch knows that.

import type { RunStatus, RunSummary } from '@jev-mice/sim'

/** A status the batch reached rather than a state someone asked for. */
const decidedByTheBatch = (s: RunStatus): boolean => s === 'failed' || s === 'completed'

export function mergeProgress(stored: RunSummary, batch: RunSummary): RunSummary {
  return {
    // Everything the control owns comes from what is stored now, not from the
    // copy the batch has been holding.
    ...stored,
    // Everything the batch owns comes from the batch.
    currentTick: batch.currentTick,
    chunks: batch.chunks,
    totals: batch.totals,
    population: batch.population,
    endReason: batch.endReason ?? stored.endReason,
    error: batch.error ?? stored.error,
    status: decidedByTheBatch(batch.status) ? batch.status : stored.status,
  }
}
