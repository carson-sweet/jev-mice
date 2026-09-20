// Counting who uses the site, without tracking them.
//
// FR-139 forbids third-party tracking and NFR-006 forbids a third-party script
// in any page served to a person. Google Analytics is exactly what those lines
// were written to exclude. Cloudflare Web Analytics is cookieless, sets no
// cross-site identity and cannot follow anyone between sites, which is what
// made narrowing the requirement defensible rather than dropping it.
//
// The token is a deployment setting. Without one the page is served untouched,
// so local development and anyone self-hosting get no beacon at all.

/** What Cloudflare issues: a plain hex identifier, and nothing else is allowed. */
const LOOKS_LIKE_A_TOKEN = /^[A-Za-z0-9]{6,64}$/

/**
 * The script tag for this deployment, or null if there should not be one.
 *
 * The token is validated even though it comes from configuration rather than
 * from a visitor: it is written into an HTML attribute, and a value able to
 * close that attribute would be script injection whatever its origin.
 */
export function beaconTag(token: string | undefined): string | null {
  const clean = (token ?? '').trim()
  if (!LOOKS_LIKE_A_TOKEN.test(clean)) return null
  // type="module" is the form Cloudflare issues, and a module is deferred by
  // default. Copied from their snippet rather than approximated, so the tag
  // stays whatever they decide it should be.
  return '<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" '
    + `data-cf-beacon='{"token": "${clean}"}'></script>`
}
