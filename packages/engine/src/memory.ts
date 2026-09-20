// A mouse remembers in sentences, because that is what the decision model reads.
// Five at a time, each expiring after its lifetime, and only what a mouse saw
// itself is ever passed on.

import type { Bearing, Cell, Memory, Provenance, Tick } from './types.js'
import { TIMING } from './types.js'

const MAX_MEMORIES = 5

export function bearingFrom(from: Cell, to: Cell): Bearing {
  const dx = Math.sign(to.x - from.x)
  const dy = Math.sign(to.y - from.y)
  if (dx === 0 && dy < 0) return 'north'
  if (dx > 0 && dy < 0) return 'northeast'
  if (dx > 0 && dy === 0) return 'east'
  if (dx > 0 && dy > 0) return 'southeast'
  if (dx === 0 && dy > 0) return 'south'
  if (dx < 0 && dy > 0) return 'southwest'
  if (dx < 0 && dy === 0) return 'west'
  if (dx < 0 && dy < 0) return 'northwest'
  return 'north'
}

export function whenWord(age: Tick): string {
  if (age < 20) return 'just now'
  if (age < 100) return 'a little while ago'
  return 'a while ago'
}

export function sentenceFor(
  kind: Memory['kind'], bearing: Bearing, age: Tick, provenance: Provenance,
): string {
  const when = whenWord(age)
  if (provenance === 'heard') {
    const what = kind === 'cat_kill' ? 'a cat' : 'a trap'
    return `Another mouse warned you about ${what} to the ${bearing}, ${when}.`
  }
  switch (kind) {
    case 'trap_death': return `You saw a mouse die in a trap to the ${bearing}, ${when}.`
    case 'cat_kill': return `You saw a cat catch and eat a mouse to the ${bearing}, ${when}.`
    case 'narrow_escape': return `You barely escaped a trap to the ${bearing}, ${when}.`
  }
}

export function addMemory(memories: Memory[], m: Memory): Memory[] {
  const next = [...memories, m]
  return next.length > MAX_MEMORIES ? next.slice(next.length - MAX_MEMORIES) : next
}

export function expireMemories(memories: Memory[], tick: Tick): Memory[] {
  return memories.filter((m) => tick - m.addedAt <= TIMING.memoryLifetime)
}

/** The freshest memory a mouse saw itself. Heard ones are never relayed. */
export function freshestSeen(memories: readonly Memory[]): Memory | undefined {
  let best: Memory | undefined
  for (const m of memories) {
    if (m.provenance !== 'seen') continue
    if (m.kind === 'narrow_escape') continue
    if (!best || m.addedAt > best.addedAt) best = m
  }
  return best
}

/** True when this mouse holds a reason to treat a place as dangerous. */
export function knowsDangerAt(memories: readonly Memory[], at: Cell): boolean {
  return memories.some((m) => m.at.x === at.x && m.at.y === at.y)
}

export function freshDangerMemory(memories: readonly Memory[], tick: Tick): boolean {
  return memories.some((m) => m.kind !== 'narrow_escape' && tick - m.addedAt < 100)
}
