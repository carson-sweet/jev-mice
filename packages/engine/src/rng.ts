// xoshiro128** with a splitmix32 seeder.
//
// Chosen because it is fast, small, has a long period, and its whole state is
// four 32-bit words, which is what lets a snapshot resume a run mid-stream.
// Every draw in the engine comes from here; nothing else may produce randomness.

export type RngState = readonly [number, number, number, number]

export interface Rng {
  /** A float in [0, 1). */
  next(): number
  /** An integer in [0, n). */
  int(n: number): number
  /** Pick one element, or undefined for an empty list. */
  pick<T>(xs: readonly T[]): T | undefined
  state(): RngState
  restore(s: RngState): void
}

function splitmix32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x9e3779b9) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad)
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97)
    return (t ^ (t >>> 15)) >>> 0
  }
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0

export function createRng(seed: number): Rng {
  const mix = splitmix32(seed)
  let s0 = mix(), s1 = mix(), s2 = mix(), s3 = mix()
  // splitmix can in principle hand back four zeros; a zero state is degenerate.
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1

  const step = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0
    const t = (s1 << 9) >>> 0
    s2 = (s2 ^ s0) >>> 0
    s3 = (s3 ^ s1) >>> 0
    s1 = (s1 ^ s2) >>> 0
    s0 = (s0 ^ s3) >>> 0
    s2 = (s2 ^ t) >>> 0
    s3 = rotl(s3, 11)
    return result
  }

  const next = (): number => step() / 4294967296
  return {
    next,
    int: (n) => (n <= 0 ? 0 : Math.floor(next() * n)),
    pick: (xs) => (xs.length === 0 ? undefined : xs[Math.floor(next() * xs.length)]),
    state: () => [s0, s1, s2, s3] as const,
    restore: (s) => { s0 = s[0] >>> 0; s1 = s[1] >>> 0; s2 = s[2] >>> 0; s3 = s[3] >>> 0 },
  }
}
