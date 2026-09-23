# Blog post outline: Designing `jev-mice` around Jev

- Working title: **What Happens When Judgment Replaces Rules? Designing `jev-mice` with Jev**
- Alternate title: **Mice, Cats, and Classifiers: Building an Agent Simulation with Jev**
- Central argument: `jev-mice` works because code owns facts and mechanics while Jev owns bounded judgments and code retains final authority over execution.

## 1. Before the mice: Jev, classifiers, and machine judgment

- Begin with the missing middle in many AI systems: code is excellent when the answer follows from explicit facts and rules, while generative models are excellent when a person needs an open-ended response, but software also contains countless bounded decisions whose answers require semantic judgment rather than calculation or prose.
- Define a classifier in the broad system-design sense used in this post: a component that reads some state and assigns it to one of a known set of meanings, actions, or levels, ideally with probabilities that express uncertainty rather than only a hard label.
- Give familiar examples: route a support request, score fraud risk, decide whether an event needs human review, select an agent's next tactic, or judge whether an observed situation is safe, urgent, suspicious, or ambiguous.
- Explain why classifiers matter architecturally: they turn fuzzy interpretation into a narrow interface that ordinary code can validate, compose, test, observe, threshold, override, and connect to deterministic actions.
- Explain the design choice: reach for a classifier when the inputs contain semantic ambiguity, the possible outputs can be bounded in advance, hand-written rules would be brittle or unmanageably large, and the cost of a wrong answer can be contained by surrounding code.
- State the inverse boundary just as strongly: do not ask a classifier to do arithmetic, schema validation, authorization, safety enforcement, state mutation, or any other operation with a deterministic right answer.
- Contrast the three common approaches engineers previously had:
  - A hand-written decision tree is fast and inspectable but only recognizes cases its author encoded, and its interacting thresholds become brittle as context grows.
  - A conventional task-specific classifier can be fast and probabilistic but usually requires a labeled dataset, training pipeline, fixed feature design, and a separate model for each new judgment.
  - A general-purpose LLM can make a new semantic judgment from instructions and context, but its native output is generated text that must be constrained, parsed, validated, and often prompted again to expose a usable confidence estimate.
- Introduce [Jev](https://typesafe.ai/) as TypeSafe's first public System One Model: an automation-oriented model that accepts program state plus structured questions and returns typed decisions rather than prose.
- Explain its three primitives from the [TypeSafe API](https://api.typesafe.ai/docs): `Noul` answers a bounded yes-or-no judgment, `Choice` selects from a predefined set, and `Score` places a subject on a predefined scale.
- Explain what makes the response useful to software: a `Choice` includes the distribution across the offered options, a `Score` includes the score and distribution across its levels, and answers include confidence so callers can weight behavior, set escalation thresholds, or decline to act.
- Be precise about what was unavailable before: semantic classification, probabilities, and structured output all existed independently; Jev's new proposition is to combine them in a model and API built specifically for fast, machine-consumable judgment rather than wrapping an autoregressive text generator and asking it to behave like a classifier.
- Mention TypeSafe's claimed technical differentiators without turning the section into marketing: answers are produced in parallel rather than token by token, output shapes and choices are fixed in advance, and the model is trained for calibrated decisions; link readers to TypeSafe's [launch explanation and published caveats](https://typesafe.ai/blog/introducing-system-one-models-and-jev).
- Explain why this matters to AI systems designers: typed probabilistic judgment makes a hybrid architecture possible in which code controls facts, policy, permissions, and effects while a model handles only interpretation at explicit decision points.
- Explain why engineers should study it rather than merely adopt it: calibration must be tested in the target domain, uncertainty can compound through a long-running system, locally plausible classifications can create surprising closed-loop outcomes, and a clean model boundary makes competing approaches empirically comparable.
- Position `jev-mice` as a laboratory for those questions: every judgment is visible, every consequence returns to the next decision as state, the rules baseline provides a control, and population dynamics expose effects that a one-shot classifier benchmark cannot.

## 2. Why mice are a useful test of machine judgment

- Open with what `jev-mice` is: an open-source, tick-based ecology on a grid where mice seek food, shelter, safety, and mates while cats hunt them, traps threaten them, disease spreads, and populations emerge from many local decisions.
- Explain the experiment: the same seeded world can be run with Jev or a deterministic rules-based decider, making the simulation a controlled comparison rather than an isolated AI demo.
- Explain why this is a good classifier problem: each animal repeatedly faces a small, bounded set of semantically meaningful choices, the world supplies observable outcomes, and thousands of decisions accumulate into population-level behavior that can be measured.
- Explain why it is a good Jev problem: the hard part is not arithmetic or pathfinding but weighing competing drives such as hunger, danger, shelter, and reproduction in context.
- Nod to [John Conway's Game of Life](https://playgameoflife.com/): Conway's famous cellular automaton shows how a grid, a few local rules, and an initial state can generate surprising global patterns; `jev-mice` asks what changes when some local transitions are judgments rather than fixed rules.
- Use the requested attribution: the Game of Life is a cellular automaton invented by legendary Cambridge mathematician John Conway.
- Preview the article: first trace a real Jev request from world state to movement, then compare it with the fixed rule ladder, then explain the ecology and the platform around it.

## 3. The governing design rule: code computes, Jev judges

- State the load-bearing rule: code owns anything with a clear right answer, and Jev is asked only genuine judgment calls over options code has already narrowed.
- List what remains deterministic code: coordinates, Chebyshev distance, perception radius, legal neighboring cells, nutrition arithmetic, timers, collision checks, trap odds, reproduction eligibility, population caps, food and trap respawn, event ordering, and seeded randomness.
- List what Jev judges for mice: which currently available drive best fits the situation and how afraid the mouse should be.
- List what Jev judges for cats: which visible mouse is worth pursuing and whether to prowl, stalk, pounce, or rest.
- Make the architectural point: Jev never directly moves an agent, mutates the world, performs arithmetic, or invents an action outside the offered criteria.

## 4. From world state to a Jev call

- Trace the decision path: engine identifies decision-ready animals → `composeRequests` builds bounded batches → `stateForMouse` converts numeric state into words → question builders attach typed criteria → the provider calls `client.systemOne(...)` → returned answers become `DecisionSubject` records → the engine applies them in ascending agent ID order.
- Explain when an animal is decision-ready: mice retain an intent for 12 ticks, or 6 when panicked, while immediate reflexes such as fleeing an adjacent cat and eating food underfoot can preempt model judgment.
- Explain option narrowing with `availableDrives`: `eat` requires food the mouse can smell, `flee` requires visible danger, `hide` requires free shelter and enough nutrition to wait, `seek_mate` requires a visible potential mate, `nest` requires a due pregnancy and shelter, and `explore` is always available; final interaction eligibility remains in code.
- Explain why the wire state contains words rather than raw numbers: `31` nutrition becomes `hungry`, a distance of three cells becomes `very close`, age becomes `a young adult`, coordinates become a bearing, and memories are already natural-language sentences.
- Explain what is deliberately withheld: raw coordinates, tick numbers, exact population counts, and the private structured `contexts` used by the fallback rules never leave the process.
- Show the actual provider boundary in a small code excerpt:

```ts
const result = await client.systemOne(
  { state: req.state, questions: req.questions, model },
  { signal: controller.signal, timeout: timeoutMs },
)
```

- Note that one request can carry up to eight spatially ordered animals, each with independently named questions, so batching reduces transport cost without merging their decisions.

## 5. Concrete call example: a hungry mouse balancing food, danger, and shelter

- Construct an example directly from the request schema for `m0007`: a hungry cautious female sees a food pile nearby to the east, a stalking cat very close to the north, a free mousehole nearby to the southwest, and remembers a recent cat kill.
- Show the abbreviated state payload Jev receives:

```json
{
  "m0007": {
    "mouse": {
      "sex": "female",
      "age": "a grown adult",
      "hunger": "hungry",
      "personality": "Cautious: flees early, avoids any place it remembers as dangerous, and prefers to forage near where it has eaten before.",
      "condition": "moving slowly because it is hungry"
    },
    "surroundings": {
      "food": "a food pile nearby to the east",
      "cats": "a cat very close to the north, stalking toward you",
      "shelter": "a free mousehole nearby to the southwest",
      "knownTraps": "no trap you know about nearby"
    },
    "memories": ["You saw a cat catch and eat a mouse to the north, a little while ago."]
  }
}
```

- Show the paired `choice` question: “What should the mouse at `m0007` do right now?” with only the criteria admitted by the engine's bounded availability filter included.
- Show a representative Jev answer shape while labeling the numbers as illustrative rather than a captured production response:

```json
{
  "drive_m0007": {
    "type": "choice",
    "choice": "hide",
    "confidence": 0.72,
    "probabilities": {
      "eat": 0.14,
      "flee": 0.28,
      "hide": 0.52,
      "explore": 0.06
    }
  }
}
```

- Explain what the provider returns to the engine: the selected `intent`, normalized probability `weights`, confidence flag, original per-question answers, source `jev`, model name, latency, and optional input-token usage.
- Explain that the probabilities are not discarded after taking the argmax: they become weights over food, danger, shelter, mating, and exploration fields, so mixed judgment changes the path rather than merely selecting a label.

## 6. Concrete call example: fear is a separate judgment from action

- Show the simultaneous `score` question: “How afraid should the mouse at `m0007` be right now?” evaluated against the ordered rubric `unconcerned`, `wary`, `alarmed`, and `panicked`.
- Show a representative response:

```json
{
  "fear_m0007": {
    "type": "score",
    "score": 2,
    "confidence": 0.86,
    "probabilities": {
      "0": 0.02,
      "1": 0.10,
      "2": 0.76,
      "3": 0.12
    }
  }
}
```

- Explain how the provider rounds and clamps the score to `alarmed`, and how the engine uses fear to reshape the distance over which danger is felt rather than simply multiplying the danger score.
- Include the movement equation in prose or code: each legal neighboring cell receives normalized food, danger, shelter, mate, and exploration signals, and the drive probabilities weight those signals while danger is subtracted.
- Explain the subtle normalization lesson: multiplying every danger value by the same fear factor would be canceled by min-max normalization, so fear instead divides distance inside the quadratic danger falloff and changes the field's shape.
- Explain the disease hook: an infected mouse is made one fear level calmer after either Jev or the rules answers, keeping toxoplasmosis mechanics independent of the decider.

## 7. Concrete call example: Jev chooses both a cat's target and mode

- Show how code determines the visible candidates and describes each in words such as “moving slowly because it is hungry, alone, very close to the southeast.”
- Show the two questions sent for one cat: which mouse is worth chasing, including `none_worth_it`, and how the cat should move, choosing among `prowl`, `stalk`, `pounce`, and `rest`.
- Show a representative response:

```json
{
  "target_c0001": {
    "type": "choice",
    "choice": "m0019",
    "confidence": 0.81,
    "probabilities": {
      "m0007": 0.12,
      "m0019": 0.74,
      "none_worth_it": 0.14
    }
  },
  "mode_c0001": {
    "type": "choice",
    "choice": "pounce",
    "confidence": 0.78,
    "probabilities": {
      "prowl": 0.05,
      "stalk": 0.14,
      "pounce": 0.78,
      "rest": 0.03
    }
  }
}
```

- Explain how the engine validates that the named mouse is still visible, applies the returned target and mode, and then uses deterministic movement, pounce range, cooldowns, collision checks, capture, eating, and nutrition restoration to execute the hunt.
- Make the boundary explicit: Jev chooses the target and tactic, but code decides whether a pounce is mechanically possible and what physically happens next.

## 8. How the rules-based engine answers the same questions

- Explain that the baseline implements the same `DecisionProvider` contract and produces the same `DecisionBatch` and `DecisionSubject` shapes, so the rest of the engine does not need a second execution path.
- Walk through the ordered mouse rule ladder: flee from a cat within two cells when shelter is not close, hide when both danger and shelter are close, prioritize food below 30 nutrition, nest when past term, eat less urgently below 60, seek a mate only when fed and clear of danger, otherwise explore.
- Include exact rule-weight examples: immediate flight returns roughly `{ flee: 0.85, explore: 0.15 }`; nearby shelter returns `{ hide: 0.70, flee: 0.30 }`; starvation returns `{ eat: 0.90, explore: 0.10 }`; and a visible cat receives a minimum danger weight even when another drive wins.
- Explain deterministic fear: adjacent means `panicked`, distance two through four means `alarmed`, five through eight or a fresh danger memory means `wary`, and otherwise the mouse is `unconcerned`.
- Explain deterministic cat judgment: minimize `distance + nutrition / 20`, which treats a hungry and therefore slower mouse as easier prey, then pounce within three cells or stalk from farther away.
- Compare the strengths: rules are fast, cheap, reproducible from a seed, easy to unit test, and legible as a control.
- Compare the limitations: the ladder encodes fixed priority boundaries, only uses the variables its author anticipated, and does not naturally integrate the full prose description or personality in the contextual way Jev can.
- Explain fallback semantics: if Jev times out, errors, returns an incomplete or invalid response, or exceeds budget, the affected batch falls back to the same baseline rules, and telemetry records the source and reason so judged and computed behavior are not conflated.

## 9. How a mouse turns judgment into movement

- Explain the five spatial fields evaluated over the current cell plus up to eight neighbors: food attraction, danger repulsion, shelter attraction, mate attraction, and exploration momentum.
- Explain field construction: food, shelter, and mates decay linearly with distance; danger from cats and known traps decays quadratically; recent motion gives exploration a directional bias.
- Explain normalization across candidate cells and combination with Jev or baseline weights.
- Explain legality checks performed after scoring: stay within the grid, avoid occupied cells and cats, and enter a mousehole only when the current intent is `hide` or `nest` and the hole is free.
- Explain seeded jitter as a deterministic tie-breaker and hunger-dependent movement speed: fed mice move every tick, hungry mice every two, and starving mice every three.
- Reiterate that an intent is not a scripted destination; it changes the forces shaping the next legal step.

## 10. The ecology outside the decision model

- **Hunger and food:** nutrition decays every tick, movement slows across fed, hungry, and starving bands, eating takes time and restores a mouse to full nutrition, depleted food either respawns elsewhere after the configured delay or remains gone, and reaching zero nutrition kills the animal.
- **Fear:** fear changes the radius and shape of danger avoidance and also changes deliberation cadence, with panicked mice reconsidering their intent twice as often.
- **Personality:** all four personalities are described to Jev; vigilant mice also have a larger deterministic perception radius, social mice exchange alarms over a longer range, and the rules baseline does not attempt the same semantic personality judgment.
- **Memory and alarms:** mice retain at most five expiring sentence memories of trap deaths, cat kills, and narrow escapes; nearby mice can relay firsthand danger memories, but hearsay is not recursively retransmitted.
- **Shelter:** a free mousehole can protect an adult or hold a brood, hidden mice cannot eat, and adults and pups leave when hunger drops below the fed threshold.
- **Mating and gestation:** `seek_mate` guides eligible adults together, mating requires an opposite-sex adult within one cell and a free mousehole within three, gestation lasts 60 ticks, and a due mother must choose `nest` and reach a free hole.
- **Birth:** delivery takes five ticks, produces a seeded litter of two to four pups subject to the population cap, places the brood in the hole, and leaves the mother outside.
- **Cats:** cats have their own nutrition, perception, target patience, pounce range, cooldown, eating time, and resting behavior; hunger makes them see farther, pounce from farther away, recover faster, and avoid resting; a cat that cannot catch prey eventually starves.
- **Traps:** entering a live trap triggers an evasion roll proportional to current nutrition; a death creates a visible danger memory, while a narrow escape creates a private memory.
- **Disease:** food can carry toxoplasmosis, infected mice burn nutrition 20 percent faster and become one fear level calmer, vertical transmission can infect pups, cats that eat infected mice begin shedding, and shedding raises future environmental contamination.
- Emphasize the causal loop: judgment changes movement, movement determines encounters, encounters change nutrition, memory, infection, pregnancy, and population, and those new facts shape later judgments.

## 11. The platform around the engine

- Describe `packages/engine` as a pure, seeded state machine with no clock, network, browser, or storage dependency.
- Describe `packages/provider-jev` as the adapter that sends `state` and `questions`, validates typed answers, records model and usage metadata, normalizes probabilities, and falls back safely.
- Describe `apps/sim` as the run loop and recording layer that advances ticks, drains events into bounded chunks, emits live frames and readable decision lines, snapshots state, and builds reports and exports.
- Describe the two host paths carefully: the local Node host serves the browser and run API for development, while the deployment path runs the same engine and fetch-based provider in Cloudflare infrastructure.
- Describe `apps/web` as the configuration, live world, population chart, event log, live mouse-decision inspector, buffered-frame playback controls, run library, stored turn history, and report surface.
- Explain event sourcing and observability: every request, returned decision, fallback, movement, birth, death, infection, and other material transition is recorded with sequence and tick metadata.
- Explain reproducibility honestly: rules runs are reproducible from configuration and seed; Jev runs may vary across calls, while their recorded answers, events, summaries, and snapshots make them inspectable and provide a foundation for a future deterministic replayer.
- Mention operational protections that belong in a technical post: server-side API keys, per-batch timeouts, usage accounting, quotas or daily budget, bounded in-memory chunks, snapshots, and source-labeled fallbacks.

## 12. What the comparison can measure

- Explain the controlled experiment: hold configuration and seed constant, switch only the decider, then compare behavior and ecological outcomes.
- Compare decision-level measures such as choices under immediate danger, confidence, fear distribution, fallback rate, latency, and input-token use.
- Compare population-level measures such as survival, extinction time, population curve, births, starvation, predation, trap deaths, infection prevalence, and lineage or personality persistence.
- Warn that one visually compelling run is not evidence; repeated seeds are needed because small initial differences can compound into divergent ecologies.
- Distinguish two questions: whether a decider makes locally plausible choices and whether those choices produce a more resilient or interesting ecosystem.

## 13. Lessons from designing around Jev

- Narrow before asking: do not send an open-ended world and ask a model to play it.
- Translate facts into the form of judgment: code computes exact state, then exposes qualitative descriptions suitable for comparison.
- Preserve distributions: the calibrated probabilities are often more useful than the top label because they can blend downstream behavior.
- Keep the control honest: the rules baseline should answer the same contract and remain visible even when it performs worse on semantic judgment.
- Design for failure as a normal state: one slow or malformed response should reduce decision quality for a bounded group, not stop the simulation.
- Record enough to audit: a model-in-the-loop system needs the state, options, answers, source, confidence, timing, and resulting world events needed to reconstruct what happened.

## 14. What's next: replace the remote judge with a local classifier or SLM

- Frame the next experiment: implement a local classifier or small language model behind the same `DecisionProvider` boundary, then run rules, Jev, and the local model against identical configurations and seeds.
- Name Kev, Laya, and Von as candidate local models or classifier approaches to evaluate, without implying that any has already been integrated.
- Define the comparison dimensions: decision agreement with Jev, calibration of returned distributions, ecological outcomes, inference latency, throughput, hardware requirements, memory use, cost, determinism, offline operation, and ease of fine-tuning from recorded decisions.
- Explain the value of the existing contract: a local provider only needs to translate the same word-based state and typed questions into the same `DecisionBatch`; the simulation engine should not need to know which model answered.
- Propose an evaluation corpus from existing telemetry: replay recorded situations, compare top choices and probability distributions, then validate the most promising model in full closed-loop simulations where its choices change future state.
- Call out the important distinction between offline imitation and closed-loop behavior: matching Jev one decision at a time does not guarantee the same population dynamics once small differences compound.

## 15. Wrap-up and invitation

- Restate the main finding: the useful pattern is not “let the model run the simulation,” but “let code establish reality and let a bounded model judge among real options.”
- Invite readers to [play with the live simulation](https://mice.jev.carsonsweet.com), run the same seed with Jev and the rules, and inspect the decisions that produce different worlds.
- Invite readers to explore and contribute to the [open-source repository](https://github.com/carson-sweet/jev-mice), especially around classifier providers, evaluation harnesses, new behavioral measures, and alternative ecological mechanics.
- Ask for comments from people working on local classifiers, SLMs, calibrated decision models, agent simulations, and artificial life.
- Close by returning to Conway: simple local rules showed how much complexity can emerge from cells; `jev-mice` is an experiment in what emerges when a few of those local transitions become contextual judgments.

## Suggested figures and code excerpts for the finished post

- A side-by-side diagram of the shared pipeline: world facts → bounded options → Jev or rules → typed decision → weighted movement fields → deterministic mechanics → events.
- One full mouse request with the drive and fear questions beside the returned choice and score payloads.
- One cat request showing candidate descriptions, selected target, and selected movement mode.
- A heatmap of the nine candidate cells showing how one returned probability distribution becomes movement scores.
- A table comparing Jev, fixed rules, and the planned local classifier across judgment quality, latency, cost, determinism, and replayability.
- A population chart for the same configuration and seed under Jev and the rules, accompanied by a warning that repeated runs are needed for conclusions.
- A screenshot of the decision inspector tying a recorded answer to the event stream and resulting movement.

## Source anchors for drafting

- `packages/engine/src/questions.ts` for the exact mouse drive, fear, cat target, and cat mode wording.
- `packages/engine/src/decisions.ts` for bucketing, option narrowing, request composition, batching, and the rules baseline.
- `packages/provider-jev/src/index.ts` for the Jev call, answer parsing, probability normalization, confidence handling, timeout, and fallback behavior.
- `packages/engine/src/engine.ts` for tick order, movement fields, application of answers, ecology, disease, memory, reproduction, and event emission.
- `packages/engine/src/types.ts` for the provider contract, timings, thresholds, personality descriptions, cat mechanics, and toxoplasmosis constants.
- `apps/sim/src/index.ts`, `apps/host`, `apps/worker`, and `apps/web` for recording, hosting, deployment, live playback, stored history, and presentation.
- `README.md` and `docs/designing-around-jev.md` for existing project framing, measured performance, and design lessons that should be reverified before publication.
