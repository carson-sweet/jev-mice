// A queued run could not be cancelled by any route.
//
// The host runs a few simulations at a time and queues the rest. control()
// refused anything without a simulation attached, and a queued run has none, so
// a backlog could only be waited through -- and a queued run sits at turn zero
// with every control inert, which is indistinguishable from a broken one.
//
// Stopping a queued run also has to let the queue move on. Dropping it without
// starting the next would leave a slot idle with runs still waiting for it.

import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '@jev-mice/engine'
import { createRunManager } from '../src/runs.js'

const manager = () => createRunManager({
  root: mkdtempSync(join(tmpdir(), 'jev-queue-')),
  maxConcurrent: 1,
  apiKey: null,
})

const config = () => ({ ...defaultConfig('small'), ticks: 20_000 })

describe('Cancelling a run that has not started', () => {
  it('Queues a run past the limit', () => {
    const m = manager()
    const first = m.create({ config: config(), seed: 1, decider: 'rules', speed: 1 })
    const second = m.create({ config: config(), seed: 2, decider: 'rules', speed: 1 })
    expect(first.status).not.toBe('queued')
    expect(m.get(second.id)?.status).toBe('queued')
    expect(m.get(second.id)?.queuePosition).toBe(1)
  })

  it('Stops a queued run, which used to be refused outright', () => {
    const m = manager()
    m.create({ config: config(), seed: 1, decider: 'rules', speed: 1 })
    const queuedRun = m.create({ config: config(), seed: 2, decider: 'rules', speed: 1 })
    expect(m.control(queuedRun.id, 'stop')).toBe(true)
    expect(m.get(queuedRun.id)?.status).toBe('cancelled')
  })

  it('Lets the next run start when a queued one ahead of it is dropped', () => {
    // Otherwise a slot sits idle with runs still waiting for it.
    const m = manager()
    m.create({ config: config(), seed: 1, decider: 'rules', speed: 1 })
    const second = m.create({ config: config(), seed: 2, decider: 'rules', speed: 1 })
    const third = m.create({ config: config(), seed: 3, decider: 'rules', speed: 1 })
    expect(m.get(third.id)?.queuePosition).toBe(2)
    m.control(second.id, 'stop')
    expect(m.get(third.id)?.queuePosition).toBe(1)
  })

  it('Will not pause or step a run that has not started', () => {
    // There is nothing to pause, and pretending otherwise would report a state
    // the run is not in.
    const m = manager()
    m.create({ config: config(), seed: 1, decider: 'rules', speed: 1 })
    const queuedRun = m.create({ config: config(), seed: 2, decider: 'rules', speed: 1 })
    expect(m.control(queuedRun.id, 'pause')).toBe(false)
    expect(m.control(queuedRun.id, 'step')).toBe(false)
    expect(m.get(queuedRun.id)?.status).toBe('queued')
  })
})
