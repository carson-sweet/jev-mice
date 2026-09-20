// Plain HTTP served the application rather than redirecting to HTTPS.
//
// Nothing secret crosses it -- there are no accounts and no credentials -- but
// a page that answers on http:// teaches people the insecure URL works, and it
// is the URL they will paste to someone else.
//
// The zone-wide "Always Use HTTPS" switch would do this too, and would do it
// for every other name on carsonsweet.com as well. This is the same outcome
// scoped to this application alone.

import { describe, it, expect } from 'vitest'
import { httpsRedirect } from '../src/https.js'

describe('Insisting on HTTPS', () => {
  it('Sends a plain request to the same URL over HTTPS', () => {
    const r = httpsRedirect(new Request('http://mice.jev.carsonsweet.com/runs?page=2'))
    expect(r?.status).toBe(301)
    expect(r?.headers.get('location'))
      .toBe('https://mice.jev.carsonsweet.com/runs?page=2')
  })

  it('Leaves a request that is already secure alone', () => {
    expect(httpsRedirect(new Request('https://mice.jev.carsonsweet.com/'))).toBeNull()
  })

  it('Believes the edge over the URL', () => {
    // Behind Cloudflare the Worker can see an https:// URL for a request that
    // reached the edge over plain http, so the visitor's own scheme is the one
    // in cf-visitor.
    const r = httpsRedirect(new Request('https://mice.jev.carsonsweet.com/', {
      headers: { 'cf-visitor': '{"scheme":"http"}' },
    }))
    expect(r?.status).toBe(301)
    expect(r?.headers.get('location')).toBe('https://mice.jev.carsonsweet.com/')
  })

  it('Is not fooled by a malformed cf-visitor header', () => {
    // An unparseable header must not be read as "insecure" and send a working
    // HTTPS request into a redirect loop.
    expect(httpsRedirect(new Request('https://mice.jev.carsonsweet.com/', {
      headers: { 'cf-visitor': 'not json' },
    }))).toBeNull()
  })

  it('Leaves local development alone', () => {
    // wrangler dev serves http on localhost and has no certificate, so
    // redirecting there would make the site impossible to work on.
    expect(httpsRedirect(new Request('http://localhost:8788/'))).toBeNull()
    expect(httpsRedirect(new Request('http://127.0.0.1:8788/api/capabilities'))).toBeNull()
  })
})
