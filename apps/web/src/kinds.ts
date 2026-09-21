// What a thing is, from its id alone.
//
// The engine prefixes every id by kind -- m, c, t, f, h -- so nothing has to
// search the frame to know what it is looking at. That matters most in the log,
// where an id turns up inside a sentence with no other context.

export type Kind = 'mouse' | 'cat' | 'trap' | 'food' | 'hole'

const BY_PREFIX: Record<string, Kind> = {
  m: 'mouse', c: 'cat', t: 'trap', f: 'food', h: 'hole',
}

/** The pattern the engine actually uses: one letter and four digits. */
const ID = /^([mctfh])\d{4}$/

export function kindOf(id: string): Kind | null {
  const match = ID.exec(id)
  return match ? BY_PREFIX[match[1] ?? ''] ?? null : null
}

export const KIND_LABEL: Record<Kind, string> = {
  mouse: 'Mouse', cat: 'Cat', trap: 'Trap', food: 'Food pile', hole: 'Mousehole',
}
