// Narrowing the two logs to one tracked thing.
//
// The distinction that matters, and that the panels have to make honestly: some
// things on the map decide, and some are decided about. A mouse and a cat have
// judgment to show. A food pile, a trap and a mousehole never answer a question,
// so their decisions list is empty and should say why rather than look broken.

import { describe, it, expect } from 'vitest'
import { logFor, decisionsFor, decides } from '../src/filtering.js'
import type { DecisionLine, LogEntry } from '@jev-mice/sim'

const entry = (over: Partial<LogEntry>): LogEntry => ({
  seq: 1, tick: 10, kind: 'born', subject: 'm0001',
  text: 'm0001 was born to m0002, bold and female.', ...over,
})

const line = (over: Partial<DecisionLine>): DecisionLine => ({
  seq: 1, tick: 10, source: 'jev', latencyMs: 40,
  subjects: [{ agentId: 'm0001', situation: 'fed', intent: 'eat', fear: 'wary', confidence: 0.8 }],
  ...over,
})

describe('Filtering the ecosystem log', () => {
  it('Keeps a line about the tracked thing', () => {
    expect(logFor([entry({})], 'm0001')).toHaveLength(1)
  })

  it('Keeps a line that only mentions it in passing', () => {
    // The mother of a litter is named in the sentence, not in the subject.
    expect(logFor([entry({ subject: 'm0001' })], 'm0002')).toHaveLength(1)
  })

  it('Drops a line about something else entirely', () => {
    expect(logFor([entry({})], 'm0009')).toHaveLength(0)
  })

  it('Keeps a trap’s own kills', () => {
    const trapped = entry({ kind: 'trapped', subject: 'm0004', text: 'm0004 died in t0006.' })
    expect(logFor([trapped], 't0006')).toHaveLength(1)
    expect(logFor([trapped], 't0007')).toHaveLength(0)
  })

  it('Does not match a longer id that merely starts the same way', () => {
    // The subject has to be overridden too: the fixture defaults to m0001,
    // which is the id being asserted absent.
    const e = entry({ subject: 'm00011', text: 'm00011 did something.' })
    expect(logFor([e], 'm0001')).toHaveLength(0)
  })

  it('Returns everything when nothing is being tracked', () => {
    const all = [entry({}), entry({ seq: 2, text: 'c0001 starved.' })]
    expect(logFor(all, null)).toHaveLength(2)
  })
})

describe('Filtering the decisions log', () => {
  it('Keeps a decision the tracked animal was a subject of', () => {
    expect(decisionsFor([line({})], 'm0001')).toHaveLength(1)
  })

  it('Drops a decision it was not part of', () => {
    expect(decisionsFor([line({})], 'm0005')).toHaveLength(0)
  })

  it('Narrows a batch to the tracked animal’s own subject', () => {
    // A batch carries up to eight animals. Showing the other seven when one is
    // being tracked is the opposite of filtering.
    const batch = line({ subjects: [
      { agentId: 'm0001', situation: 'fed', intent: 'eat', fear: 'wary', confidence: 0.8 },
      { agentId: 'm0002', situation: 'hungry', intent: 'flee', fear: 'alarmed', confidence: 0.6 },
    ] })
    const out = decisionsFor([batch], 'm0002')
    expect(out).toHaveLength(1)
    expect(out[0]!.subjects).toHaveLength(1)
    expect(out[0]!.subjects[0]!.agentId).toBe('m0002')
  })

  it('Returns everything when nothing is being tracked', () => {
    expect(decisionsFor([line({}), line({ seq: 2 })], null)).toHaveLength(2)
  })

  it('Gives nothing at all for a thing that does not decide', () => {
    for (const id of ['f0001', 't0001', 'h0001']) {
      expect(decisionsFor([line({})], id)).toHaveLength(0)
    }
  })
})

describe('Knowing which things decide', () => {
  it('Says a mouse and a cat do', () => {
    expect(decides('m0001')).toBe(true)
    expect(decides('c0001')).toBe(true)
  })

  it('Says a trap, a food pile and a mousehole do not', () => {
    // This is what lets the panel explain itself instead of showing an empty
    // list that looks like a bug.
    expect(decides('t0001')).toBe(false)
    expect(decides('f0001')).toBe(false)
    expect(decides('h0001')).toBe(false)
  })
})
