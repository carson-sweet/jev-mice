// Reading the page out of the URL.
//
// It used to be the hash -- #/runs -- for one reason: the deployment served
// assets with no single-page fallback, so asking for /runs returned a 404
// instead of the application. The hash never reaches the server, which made it
// work everywhere and put a # in every link anyone might share.
//
// With the fallback configured the path works, so these are real URLs now. The
// parsing is a pure function because a link that a person pastes is exactly the
// input worth testing.

import { describe, it, expect } from 'vitest'
import { parseRoute, hrefFor } from '../src/routing.js'

describe('Reading a route from a path', () => {
  it('Reads the live view', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' })
    expect(parseRoute('')).toEqual({ kind: 'home' })
  })

  it('Reads the run library', () => {
    expect(parseRoute('/runs')).toEqual({ kind: 'runs' })
    expect(parseRoute('/runs/')).toEqual({ kind: 'runs' })
  })

  it('Reads one run', () => {
    expect(parseRoute('/runs/abc-123')).toEqual({ kind: 'run', id: 'abc-123' })
  })

  it('Still understands a hash link someone saved earlier', () => {
    // Every link shared before this change has a # in it, and those should not
    // become dead.
    expect(parseRoute('/', '#/runs')).toEqual({ kind: 'runs' })
    expect(parseRoute('/', '#/runs/abc-123')).toEqual({ kind: 'run', id: 'abc-123' })
  })

  it('Falls back to the live view for anything it does not recognise', () => {
    expect(parseRoute('/nonsense')).toEqual({ kind: 'home' })
    expect(parseRoute('/runs/a/b')).toEqual({ kind: 'home' })
  })

  it('Builds the links it can read back', () => {
    // Round trip, so a link the page writes is a link the page understands.
    expect(parseRoute(hrefFor({ kind: 'runs' }))).toEqual({ kind: 'runs' })
    expect(parseRoute(hrefFor({ kind: 'run', id: 'abc-123' })))
      .toEqual({ kind: 'run', id: 'abc-123' })
    expect(hrefFor({ kind: 'runs' })).toBe('/runs')
    expect(hrefFor({ kind: 'run', id: 'x' })).toBe('/runs/x')
  })

  it('Writes no hash into a new link', () => {
    for (const route of [{ kind: 'home' }, { kind: 'runs' },
                         { kind: 'run', id: 'x' }] as const) {
      expect(hrefFor(route)).not.toContain('#')
    }
  })
})
