// Shared fixtures for the engine specifications. These describe the world the
// scenarios in the user stories set up, so a spec reads close to its Gherkin.
import {
  createEngine, defaultConfig, baselineProvider,
  type Engine, type RunConfig, type SimEvent, type AgentId, type MouseView,
} from '../src/index.js'

export const SEED = 1749302811

export function medium(overrides: Partial<RunConfig> = {}): RunConfig {
  return { ...defaultConfig('medium'), ...overrides }
}

export function engine(config: RunConfig = medium(), seed = SEED): Engine {
  return createEngine({ config, seed, provider: baselineProvider() })
}

export async function runTicks(e: Engine, n: number): Promise<SimEvent[]> {
  const before = e.events().length
  await e.run(n)
  return e.events().slice(before)
}

export function of<K extends SimEvent['kind']>(
  events: readonly SimEvent[], kind: K,
): Extract<SimEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind)
}

/** Compare two streams ignoring fields that record duration rather than outcome. */
export function comparable(events: readonly SimEvent[]): unknown[] {
  return events.map((e) => {
    const { ...rest } = e as unknown as Record<string, unknown>
    delete rest['latencyMs']
    return rest
  })
}

export function mouse(e: Engine, id: AgentId): MouseView {
  const m = e.world().mice.find((x) => x.id === id)
  if (!m) throw new Error(`no mouse ${id}`)
  return m
}
