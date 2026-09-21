// What the Worker is given at runtime. Every one of these is a deployment
// setting rather than a constant in the code, which FR-134 requires.

export interface Env {
  RUN: DurableObjectNamespace
  BUDGET: DurableObjectNamespace
  REGISTRY: DurableObjectNamespace
  RECORDS: R2Bucket
  /** The built viewer, served for everything that is not an API route. */
  ASSETS: Fetcher
  /** A secret. Absent means the deployment offers the fixed rules only. */
  TYPESAFE_API_KEY?: string
  TYPESAFE_BASE_URL?: string
  TYPESAFE_DEFAULT_MODEL?: string
  /** Dollars a day, across every visitor. Past it, runs fall back to the rules. */
  JEV_DAILY_BUDGET_USD?: string
  JEV_PRICE_PER_MTOK?: string
  /**
   * Cloudflare Web Analytics. Absent means no beacon is injected at all, which
   * is what local development and any self-hosted copy get.
   */
  CF_ANALYTICS_TOKEN?: string
  /**
   * The longest run this deployment allows, in turns. Absent means whatever the
   * engine allows. Lower than the engine's own ceiling because anyone with the
   * link can start work here.
   */
  MAX_TICKS?: string
}

export const numberFrom = (v: string | undefined, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
