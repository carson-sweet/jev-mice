// A batch must not clobber a control change made while it was running.
//
// The alarm reads the run summary when a batch starts, advances up to 250 ticks
// -- which at a watchable pace is a minute of wall time -- and writes the whole
// summary back when it finishes. Anything changed in between went with it: set
// the speed to 50 mid-batch and the batch ended by writing back the 2 it had
// started with, so the slider worked for a few seconds and then snapped back.
// Measured on the deployment: speed 2, set to 50, and after a pause and resume
// the run was at 2 again.
//
// The batch owns progress. The control owns pace and intent. Persisting has to
// respect that split.

import { describe, it, expect } from 'vitest'
import { mergeProgress } from '../src/progress.js'
import type { RunSummary } from '@jev-mice/sim'

const summary = (over: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r1', status: 'running', createdAt: '2026-09-21T00:00:00Z', seed: 1,
  config: {} as never, currentTick: 0, queuePosition: null, chunks: [],
  totals: { currentTick: 0, requests: 0, inputTokens: 0, fallbackCount: 0,
            population: { mice: { peak: 0, min: 0, current: 0 },
                          cats: { peak: 0, min: 0, current: 0 } } },
  error: null, decidedBy: 'rules', speed: 2,
  population: { mice: { peak: 0, min: 0, current: 0 },
                cats: { peak: 0, min: 0, current: 0 } },
  endReason: null, ...over,
})

describe('Persisting a batch without losing a control change', () => {
  it('Keeps a speed set while the batch was running', () => {
    const batch = summary({ speed: 2, currentTick: 120 })
    const stored = summary({ speed: 50 })
    expect(mergeProgress(stored, batch).speed).toBe(50)
  })

  it('Keeps a pause set while the batch was running', () => {
    const batch = summary({ status: 'running', currentTick: 120 })
    const stored = summary({ status: 'paused' })
    expect(mergeProgress(stored, batch).status).toBe('paused')
  })

  it('Takes the progress from the batch, which is what the batch knows', () => {
    const batch = summary({
      currentTick: 120,
      chunks: [{ seq: 0, firstTick: 1, lastTick: 120, bytesGzip: 10 }],
      population: { mice: { peak: 80, min: 40, current: 60 },
                    cats: { peak: 3, min: 3, current: 3 } },
    })
    const stored = summary({ currentTick: 0 })
    const merged = mergeProgress(stored, batch)
    expect(merged.currentTick).toBe(120)
    expect(merged.chunks).toHaveLength(1)
    expect(merged.population.mice.peak).toBe(80)
  })

  it('Lets the batch end a run, since only the batch knows it ended', () => {
    const batch = summary({ status: 'failed', error: 'engine gave up', endReason: null })
    const stored = summary({ status: 'running' })
    const merged = mergeProgress(stored, batch)
    expect(merged.status).toBe('failed')
    expect(merged.error).toBe('engine gave up')
  })

  it('Prefers the stored status when the batch merely kept running', () => {
    // A batch that ran normally has nothing to say about intent, so a pause or
    // a stop recorded during it stands.
    for (const intent of ['paused', 'cancelled'] as const) {
      const merged = mergeProgress(summary({ status: intent }), summary({ status: 'running' }))
      expect(merged.status).toBe(intent)
    }
  })

  it('Keeps the extinction reason the batch found', () => {
    const merged = mergeProgress(summary(), summary({ endReason: 'extinct' }))
    expect(merged.endReason).toBe('extinct')
  })
})
