// Cloudflare Web Analytics, chosen over Google Analytics because FR-139 forbids
// third-party tracking and NFR-006 forbids a third-party script in any page.
// The beacon is cookieless and carries no cross-site identity, which is what
// made narrowing those requirements defensible rather than dropping them.
//
// The token is deployment configuration, not a constant: a deployment without
// one must serve exactly the page it serves today, with nothing injected.

import { describe, it, expect } from 'vitest'
import { beaconTag } from '../src/analytics.js'

describe('The usage beacon', () => {
  it('Adds nothing at all when no token is configured', () => {
    // Local development and anyone self-hosting get an unmodified page.
    expect(beaconTag(undefined)).toBeNull()
    expect(beaconTag('')).toBeNull()
    expect(beaconTag('   ')).toBeNull()
  })

  it('Points at Cloudflare and carries the token', () => {
    const tag = beaconTag('abc123')
    expect(tag).toContain('https://static.cloudflareinsights.com/beacon.min.js')
    expect(tag).toContain('"token": "abc123"')
  })

  it('Loads without blocking the page', () => {
    expect(beaconTag('abc123')).toContain('defer')
  })

  it('Refuses a token that is not a plain identifier', () => {
    // The token lands inside an HTML attribute. It comes from configuration
    // rather than from a visitor, but a value that could close the attribute
    // and open a tag must never be written into the page regardless of where
    // it came from.
    expect(beaconTag('abc" onload="alert(1)')).toBeNull()
    expect(beaconTag('</script><script>evil()</script>')).toBeNull()
    expect(beaconTag('abc<123')).toBeNull()
  })

  it('Accepts the shape Cloudflare actually issues', () => {
    // A 32-character hex string.
    expect(beaconTag('0123456789abcdef0123456789abcdef')).not.toBeNull()
  })
})
