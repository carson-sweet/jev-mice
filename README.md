# jev-mice

A tick-based ecology of mice, cats, traps, food, and mouseholes. Animal decisions come from [TypeSafe Jev](https://typesafe.ai/) or a fixed-rules control, while a deterministic engine retains authority over facts, legal actions, movement, interactions, and consequences.

[Play the live simulation](https://mice.jev.carsonsweet.com/) · [Read the design article](https://carsonsweet.substack.com/p/what-happens-when-judgment-replaces)

## Run it locally

```bash
npm install
cp .env.example .env   # optional; add a TypeSafe API key to enable Jev
npm run build
npm start              # http://localhost:8787
```

Without a key, the application offers the fixed rules. With `TYPESAFE_API_KEY` set in `.env`, each run can use either Jev or the rules, so the same configuration and seed can be compared through both decision providers. The local host reads the key; it is never sent to the browser.

`.env` is gitignored. Every setting it holds is listed in `.env.example`.

For viewer development, leave `npm start` running and use `npm run dev` in another terminal. Vite serves the page with hot reload and proxies its API requests to the host on port 8787.

## What is here

| Path | What it is |
|---|---|
| `packages/engine` | The pure, seeded simulation state machine. It has no clock, network, browser, or storage dependency. |
| `packages/provider-jev` | The TypeSafe adapter. It validates typed answers, normalizes distributions, records metadata, and falls back by batch. |
| `apps/sim` | The run loop, event chunking, snapshots, reports, and exports shared by local and deployed execution. |
| `apps/host` | The local HTTP and WebSocket host with filesystem-backed run storage. |
| `apps/web` | The configuration, live simulation, inspection, history, report, and playback interface. |
| `apps/worker` | The Cloudflare Worker, Durable Objects, budget enforcement, registry, and R2-backed production path. |
| `scripts/survival-sweep.mjs` | A headless fixed-rules sweep across configurations and seeds. |

The engine itself is deterministic: given the same seed and the same decision answers, it produces the same event stream. A rules run is therefore reproducible from its configuration and seed. A Jev run is not guaranteed to receive identical judgments when repeated, so its event record, typed answers, source labels, summaries, and snapshots make the completed run inspectable even when the seed alone cannot reproduce it.

The verification commands are:

```bash
npm test
npm run test:determinism
npm run typecheck
npm run build
```

## How a decision is made

Code narrows first. A mouse is offered only the drives its situation allows: `eat` when it perceives food, `flee` when danger is visible, `hide` when suitable shelter is available, `seek_mate` when a potential mate is visible, and `nest` when a pregnancy is past term. `explore` is always offered, so the option set cannot be empty. Deterministic checks still decide whether the chosen action is legal when the animal reaches its destination.

Jev receives a qualitative description rather than raw simulation state. Distances become `very close` or `nearby`, nutrition becomes `hungry`, cat behavior becomes `stalking toward you` or `about to pounce`, and memories are sentences. Code retains coordinates, counters, arithmetic, timers, collision rules, and other facts with deterministic answers.

Up to eight spatially ordered animals share one request, but every animal keeps its own state and independently named questions. Batching reduces transport cost without merging their decisions.

For a mouse, Jev returns a `Choice` over the available drives and a `Score` over an ordered fear scale. The provider preserves the full probability distributions. The named choice controls discrete behavior such as whether a mouse may enter a hole, while all drive probabilities become weights over normalized food, danger, shelter, mate, and exploration fields for movement.

Fear changes the distance over which danger is felt, not merely the size of a danger score. Because the candidate-cell fields are normalized, multiplying the entire danger field by one constant would be canceled. The engine instead reshapes the distance falloff before normalization.

Cats use the same boundary with different questions: Jev selects a visible target and a tactic to attempt, while code validates the target, range, cooldown, path, capture, eating, and nutrition effects.

When Jev times out, errors, returns an incomplete answer, or reaches an external budget, only the affected batch falls back to the fixed rules. The event record preserves the source and fallback reason so judged and computed behavior are not conflated.

## Watching a run

The speed slider controls server-side pacing. Jev runs are capped at six ticks per second because inference is the limiting step; rules runs are capped at fifty so the result remains watchable. Frame delivery is also bounded, so a fast run does not flood the browser.

Click any object on the grid to inspect it and filter the activity and decisions to that subject. The population chart and event log show how the ecology changes, while the live decision inspector shows the situation, intent, fear, confidence, source, latency, and fallback status for mouse decisions. Cat decisions remain in the stored event data.

The transport controls operate over buffered live frames. Moving backward changes the browser's playhead; it does not rewind the running engine. The History view provides stored turn-by-turn inspection for completed and active runs.

The run library lists the seed, configuration, provider, progress, and population extrema for every retained run. Each run exposes a human-readable report, a machine-readable JSON report, and a streamed zip containing newline-delimited JSON metadata and events.

## Reading the map

Shape carries identity independently of color: mice are blue circles, cats are red triangles, food is a green square, traps are orange diamonds, and mouseholes are gray rings. A yellow dot marks hunger. Mouseholes show whether they contain an adult or a brood, and selection and event highlighting use a yellow ring.

Cats have independent nutrition. Hunger increases their perception and pounce range, reduces their pounce cooldown, and removes resting after lost prey. A cat that catches nothing eventually starves, which is the only way predation pressure leaves the world. A run ends early when both mice and cats are gone.

## Collecting evidence across runs

One run is not evidence. Initial placement and seeded random events can push the same configuration toward different ecological outcomes, while Jev adds variation at the decision boundary.

Useful experiments separate three comparison jobs:

- Run one provider across different seeds to measure sensitivity to initial placement and the engine's seeded random events.
- Repeat Jev with the same configuration and seed to measure variation in model judgment. Repeating the fixed rules with an unchanged seed adds no information because that path is deterministic.
- Pair providers by running every selected seed through the fixed rules and through Jev. Compare decision-level behavior separately from population-level outcomes.

Keep the configuration, seed, provider source, fallback count, model, run length, and exported event record with every result. Otherwise, a fallback or configuration change can look like a behavioral difference.

The local host stores runs under `.data` and exposes endpoints that can be automated from a script:

| Endpoint | Purpose |
|---|---|
| `POST /api/runs` | Create a run with an explicit configuration, seed, `jev` or `rules` decider, and optional speed. |
| `GET /api/runs/:id` | Poll status and summary data. |
| `GET /api/runs/:id/report` | Collect the machine-readable report. |
| `GET /api/runs/:id/report.md` | Collect the human-readable report. |
| `GET /api/runs/:id/export` | Download the complete zipped event record. |

This makes it practical to write a local script that iterates over a declared seed list, runs matched providers, waits for completion, and saves one report and export per provider and seed. Set `TYPESAFE_API_KEY` in `.env` for Jev runs; rules runs need no external service.

For larger deterministic studies, the included survival sweep runs the fixed-rules engine headlessly across a grid of configurations and seeds:

```bash
node scripts/survival-sweep.mjs --seeds 16 --ticks 4000 --workers 8
```

The arguments control the number of fixed seeds per configuration, observation horizon, and local worker processes. The sweep records the tick at which the last mouse died, or `null` when the colony survives the horizon, then regenerates `packages/engine/src/survival-table.ts`. It evaluates only the deterministic rules control; use the local host for Jev experiments so source labels, fallbacks, latency, usage, reports, and full decision records are retained.

## Deployment

The public application runs at [mice.jev.carsonsweet.com](https://mice.jev.carsonsweet.com/). A Cloudflare Worker serves the built viewer and API. Each simulation is owned by a Run Durable Object, a registry tracks run history, a budget object limits aggregate Jev usage, and R2 stores event chunks, summaries, and snapshots. The Worker and local host expose the same browser-facing routes, so the viewer does not need a deployment-specific execution path.

The production API key remains server-side. When a Jev allowance is unavailable or exhausted, affected decisions fall back to the fixed rules and record that source change rather than stopping the simulation.
