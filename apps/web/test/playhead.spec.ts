// The playhead is the one piece of the viewer with arithmetic in it, so it
// lives apart from the components and is tested on its own.
import { describe, it, expect } from 'vitest'
import { indexFor, resolve, type Playhead } from '../src/playhead.js'

/** Frames arrive every few turns, never one per turn. */
const frames = [10, 20, 30, 40, 50]

describe('Where the playhead sits', () => {
  it('Is the newest frame when it is live', () => {
    expect(indexFor(frames, null)).toBe(4)
  })

  it('Is the frame a turn names', () => {
    expect(indexFor(frames, 30)).toBe(2)
  })

  it('Is the newest frame at or before a turn nothing was sent for', () => {
    // Asked for turn 35; the last thing actually seen was turn 30.
    expect(indexFor(frames, 35)).toBe(2)
  })

  it('Clamps to the oldest frame still held when its turn has fallen out', () => {
    expect(indexFor(frames, 5)).toBe(0)
  })

  it('Holds still as new frames arrive', () => {
    // The point of naming a turn rather than counting back from the end: the
    // view must not slide while the run keeps going.
    const held: Playhead = 30
    expect(indexFor(frames, held)).toBe(2)
    expect(indexFor([...frames, 60, 70], held)).toBe(2)
  })

  it('Says it is empty when there are no frames', () => {
    expect(indexFor([], null)).toBe(-1)
    expect(indexFor([], 10)).toBe(-1)
  })
})

describe('Moving the playhead', () => {
  const at = (p: Playhead) => resolve(frames, p)

  it('Reports how far back it is and whether that is live', () => {
    expect(at(null)).toMatchObject({ index: 4, behind: 0, live: true })
    expect(at(30)).toMatchObject({ index: 2, behind: 2, live: false })
  })

  it('Treats naming the newest turn as live', () => {
    // Otherwise returning to the end by scrubbing would leave the view frozen
    // on what was newest at the time.
    expect(at(50)).toMatchObject({ index: 4, live: true })
  })

  it('Steps back one frame at a time', () => {
    expect(at(null).back).toBe(40)
    expect(at(40).back).toBe(30)
    expect(at(10).back).toBe(10)
  })

  it('Steps forward one frame at a time, and reaches live', () => {
    expect(at(10).forward).toBe(20)
    expect(at(40).forward).toBe(null)
    expect(at(null).forward).toBe(null)
  })

  it('Goes all the way to either end', () => {
    expect(at(30).start).toBe(10)
    expect(at(30).end).toBe(null)
  })

  it('Seeks by frame position', () => {
    expect(at(null).seek(0)).toBe(10)
    expect(at(null).seek(2)).toBe(30)
    expect(at(null).seek(4)).toBe(null)
    expect(at(null).seek(99)).toBe(null)
    expect(at(null).seek(-1)).toBe(10)
  })

  it('Survives an empty buffer without pretending to point at anything', () => {
    const empty = resolve([], null)
    expect(empty).toMatchObject({ index: -1, behind: 0, live: true })
    expect(empty.back).toBe(null)
    expect(empty.forward).toBe(null)
    expect(empty.start).toBe(null)
  })
})
