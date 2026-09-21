// Reading the page out of the URL.
//
// It used to be the hash -- #/runs -- for one reason: the deployment served its
// assets with no single-page fallback, so asking for /runs returned a 404
// rather than the application. A hash never reaches the server, which made it
// work everywhere at the cost of a # in every link anyone might share.
//
// The fallback is configured now, so these are real paths. Hash links are still
// understood, because every link shared before this change has one in it.

export type Route =
  | { kind: 'home' }
  | { kind: 'runs' }
  | { kind: 'run'; id: string }

const RUN = /^\/runs\/([^/]+)\/?$/
const RUNS = /^\/runs\/?$/

function fromPath(path: string): Route | null {
  if (RUNS.test(path)) return { kind: 'runs' }
  const run = RUN.exec(path)
  if (run?.[1] !== undefined) return { kind: 'run', id: run[1] }
  if (path === '' || path === '/') return { kind: 'home' }
  return null
}

/**
 * The route for a location. The hash is consulted only when the path says
 * nothing, so an old shared link still lands where it used to.
 */
export function parseRoute(pathname: string, hash = ''): Route {
  const direct = fromPath(pathname)
  if (direct !== null && direct.kind !== 'home') return direct
  const hashed = hash.startsWith('#') ? fromPath(hash.slice(1)) : null
  return hashed ?? { kind: 'home' }
}

export function hrefFor(route: Route): string {
  if (route.kind === 'runs') return '/runs'
  if (route.kind === 'run') return `/runs/${route.id}`
  return '/'
}
