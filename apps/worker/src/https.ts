// Plain HTTP answered with the application instead of pointing at HTTPS.
//
// The zone-wide "Always Use HTTPS" switch would fix this and would also apply
// to every other name on carsonsweet.com. This is the same outcome scoped to
// this application, which is the only one it was observed on.

/** Where the visitor's request actually reached the edge from. */
const schemeOf = (request: Request): string => {
  const url = new URL(request.url)
  // Behind Cloudflare the Worker can see https:// for a request that arrived
  // over plain http, so the visitor's own scheme is the one in cf-visitor.
  const visitor = request.headers.get('cf-visitor')
  if (visitor !== null) {
    try {
      const parsed = JSON.parse(visitor) as { scheme?: unknown }
      if (typeof parsed.scheme === 'string') return parsed.scheme
    } catch {
      // Unreadable. Fall through to the URL rather than guess "http", which
      // would put a working HTTPS request into a redirect loop.
    }
  }
  return url.protocol.replace(':', '')
}

/** Local development has no certificate, so it is left alone. */
const isLocal = (host: string): boolean =>
  host === 'localhost' || host === '127.0.0.1' || host === '[::1]'

/** A redirect to the same URL over HTTPS, or null if none is needed. */
export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url)
  if (isLocal(url.hostname)) return null
  if (schemeOf(request) === 'https') return null
  url.protocol = 'https:'
  return Response.redirect(url.toString(), 301)
}
