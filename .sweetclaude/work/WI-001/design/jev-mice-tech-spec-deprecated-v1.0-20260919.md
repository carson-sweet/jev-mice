---
title: jev-mice Technical Specification
version: 1.0
status: deprecated
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: initial draft
previous_file: none
---

# jev-mice Technical Specification

**Version:** 1.0 (draft)

**Date:** 2026-09-19

**Work item:** WI-001

**Companions.** Architecture v2.1 explains the shape and why. Data model v1.0 defines the stores and the types. API design v1.0 defines every interface. This document is what a developer needs that none of those provide: how the engine works tick by tick, the exact words sent to Jev, the rules that stand in when Jev is absent, and how the whole thing is built, tested, run, and deployed. Where this document and an earlier one disagree, this one is newer and the earlier one gets revised.

## 1. Repository and tooling

### 1.1 Layout

```
jev-mice/
  package.json                     npm workspaces root, shared scripts
  tsconfig.base.json               strict, ES2022, bundler resolution
  vitest.workspace.ts
  .github/workflows/{ci.yml,deploy.yml}
  .env.example                     documents every variable, holds no value

  packages/engine/                 no DOM, no network, no clock
    src/
      config.ts                    RunConfig type, zod schema, caps, defaults
      rng.ts                       xoshiro128** plus splitmix32 seeding
      world.ts                     grid, cells, occupancy
      clock.ts                     tick loop order, timers
      signals.ts                   the four fields and their evaluation
      agents/{mouse.ts,cat.ts}
      perception.ts                what each agent can see and smell
      memory.ts                    sentences, expiry, alarm exchange
      reproduction.ts              eligibility, mating, gestation, birth
      decisions/
        contract.ts                question ids, option sets, answer types
        bucketing.ts               numbers to words
        compose.ts                 build a System One request for a batch
        apply.ts                   answers to intents and weights
        baseline.ts                fixed-weight substitution
        provider.ts                DecisionProvider interface
      events.ts                    the SimEvent union
      chunk.ts  summary.ts  snapshot.ts
      engine.ts                    createEngine, step, snapshot, subscribe
      index.ts                     the public surface
    test/

  apps/sim/                        Node, runs in the container
    src/{main.ts,loop.ts,jev.ts,objects.ts,reporter.ts,env.ts}
    Dockerfile

  apps/worker/                     Cloudflare Worker
    src/
      index.ts                     Hono app, static assets, route mounting
      middleware/{session.ts,authFlag.ts,rateLimit.ts,error.ts}
      routes/{auth,me,runs,records,share,account,internal}.ts
      do/{run.ts,quotaCounter.ts,globalLimits.ts}
      db/{schema.ts,client.ts,queries.ts}
      r2.ts  sentry.ts
    drizzle/                       generated migrations
    wrangler.jsonc

  apps/web/                        Vite + React viewer
    src/
      routes/{SignIn,Configure,Live,Library,RunDetail,Compare,Share,Account}.tsx
      canvas/{renderer.ts,sprites.ts,packing.ts}
      charts/{UPlotChart.tsx,series.ts}
      ws/{client.ts,protocol.ts}
      api/{client.ts,types.ts}
      state/{session.ts,run.ts}
    index.html
```

[1] **The dependency rule is one line and the build enforces it.** `packages/engine` imports nothing from `apps/*`. Everything else may import the engine. A pull request that breaks this fails typecheck, because the engine's `tsconfig` has no path mapping to the apps.

### 1.2 Tooling

| Concern | Choice | Note |
|---|---|---|
| Package manager | npm workspaces | Already the tool in the sibling project; no extra install step |
| TypeScript | 5.x, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | The last two catch the class of bug that makes a simulation drift |
| Lint and format | Biome | One tool, one config, fast; replaces the eslint and prettier pair |
| Tests | Vitest with a workspace file | Engine tests run in Node, Worker tests in the Cloudflare pool |
| Schema validation | zod 4 | The engine owns the schemas; the Worker imports them |
| Database migrations | Drizzle Kit | Generated from the schema, committed, applied per branch |
| Local platform | `@cloudflare/vite-plugin` | Runs the real Workers runtime with local KV, R2, and Durable Objects |

### 1.3 Source control and branching

[2] GitHub, `carson-sweet/jev-mice`, private. Trunk-based: short-lived branches off `main`, pull requests that must pass checks, squash merge. `main` is always deployable and is what production runs.

[3] Conventional commit subjects, because the changelog and the release notes come from them.

## 2. Local development

[4] A new machine, start to first tick, assuming Node 20 or newer and Docker running:

```bash
git clone git@github.com:carson-sweet/jev-mice.git && cd jev-mice
npm install
cp .env.example .dev.vars          # then fill in the four secrets below
npm run db:migrate                 # applies Drizzle migrations to the Neon dev branch
npm run dev                        # Vite + Worker + local KV/R2/DO, container built on demand
open http://localhost:5173
```

[5] `.dev.vars` holds `TYPESAFE_API_KEY`, `GOOGLE_ID`, `GOOGLE_SECRET`, `NEON_DATABASE_URL`, `SESSION_SIGNING_KEY`, and `SENTRY_DSN`. It is gitignored and `.env.example` documents each one with no values.

[6] **Nothing but the database is remote in development.** KV, object storage, Durable Objects, and the container all run locally under the Cloudflare tooling, so a developer with no Cloudflare account can run everything except a real deploy. The database points at the Neon `dev` branch because exercising the serverless driver locally is the only way driver differences surface before staging.

[7] **Working on the engine alone needs none of it.** `npm test -w packages/engine` and `npm run sim:local -- --config fixtures/medium.json --seed 42 --baseline` run a full simulation headless with no network, no container, and no account. This is the loop to live in while the mechanics are being tuned.

## 3. Environments

| | Local | Staging | Production |
|---|---|---|---|
| Worker | vite plugin, `workerd` | `jev-mice-staging` | `jev-mice` |
| Database branch | `dev` | `staging` | `main` |
| Object store | local simulation | `jev-mice-staging` bucket | `jev-mice` bucket |
| Sessions | local namespace | staging namespace | production namespace |
| Container image | built on demand | tagged from the commit | tagged from the commit |
| Sign-in | real Google client, localhost callback | real, staging callback | real, production callback |
| `AUTH_REQUIRED` | false by default | true | true |
| `JEV_ENABLED` | developer's choice | true | true |
| Global budget | small, to exercise the path | small | set deliberately |

[8] Promotion is by commit: a green pull request merges to `main`, which deploys production. Staging deploys from the same workflow on a manual trigger against any branch, so a change can be exercised end to end before it merges.

## 4. Continuous integration and deployment

### 4.1 On every pull request

```yaml
# .github/workflows/ci.yml
name: ci
on: pull_request
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --coverage
      - run: npm run build
      - name: Engine determinism suite
        run: npm run test:determinism
```

[9] The determinism suite is called out as its own step so that a failure is legible in the checks list rather than buried in a thousand passing assertions. It is the project's load-bearing guarantee.

### 4.2 On merge to main

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push: { branches: [main] }
  workflow_dispatch:
    inputs:
      environment: { type: choice, options: [staging, production] }
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment || 'production' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run db:migrate           # expand-only; never destructive
      - run: npx wrangler deploy --env ${{ inputs.environment || 'production' }}
      - run: npm run smoke -- --base $DEPLOY_URL
```

[10] **Migrations run before the deploy and are expand-only**, so the previous release's code keeps working against the new schema for the length of the deploy. Dropping a column is a separate release, never the same one that stopped writing it.

[11] **The smoke check is three requests**: the app loads, `/api/me` answers, and a configuration validates. It catches the deploy that broke everything, which is the failure worth catching automatically.

[12] **Rollback is `wrangler rollback` or a revert and redeploy**, both under a minute. Because migrations are expand-only, rolling code back never needs a database rollback.

## 5. Engine internals

### 5.1 Randomness

[13] One generator, `xoshiro128**`, seeded by expanding the run's 32-bit seed through `splitmix32` into four words. It is fast, small, has a long period, and is trivially serializable as four integers, which is what makes a snapshot able to resume mid-stream.

```ts
export interface Rng { next(): number; state(): RngState; restore(s: RngState): void }
```

[14] **Every draw in the engine comes from this one object, and `Math.random` appears nowhere.** A lint rule forbids it inside `packages/engine`. Two runs with the same seed, configuration, and decision answers draw the same numbers in the same order, which is the whole basis of replay and resume.

### 5.2 Tick order

[15] The order below is fixed. Changing it changes outcomes for the same seed, so it is versioned with the engine and any change is a new `engineVersion`.

```
 1  tick += 1
 2  expire timers: eating, mating, gestation, birth, cooldowns,
                   respawns, memory expiry, hole exits
 3  recompute dirty signal sources (food, traps, holes, cat positions)
 4  reflexes: for each mouse in ascending id order,
       cat adjacent          -> intent = flee   (preempts, no decision)
       on food, not full     -> intent = eat    (preempts, no decision)
 5  collect decision-ready agents; group mice by 16x16 tile, at most 8 per batch;
    cats individually
 6  await every batch for this tick; apply answers in ascending agent id order
 7  move: for each agent due to move this tick, in ascending id order
 8  resolve interactions in this order: trap entry, capture,
    eating completion, hole entry, mating, birth
 9  resolve deaths, then births
10  memory: witnessing, then alarm exchange, then nothing else
11  append the summary row
12  chunk boundary check: 250 ticks or 8 MB raw
```

[16] **Step 6 is the subtle one.** Decision batches are network calls that return in whatever order the network gives them. The engine waits for all of them, then applies them sorted by agent id. Applying an answer the moment it arrives would make the outcome depend on network timing, and replay would diverge from the live run it was recorded from. This single rule is what lets an asynchronous decision source sit inside a deterministic engine.

[17] **Ascending id order, everywhere.** Ids are assigned from a monotonic counter, never reused, and every loop that can draw randomness or mutate shared state iterates in that order rather than in insertion or map order.

### 5.3 Signal fields

[18] Fields are not materialized over the grid. For a mouse about to move, each field is evaluated at the nine candidate cells: its own and the eight neighbors. With twenty food piles that is a few hundred arithmetic operations per moving mouse per tick, which is nothing, and it avoids allocating four grids per mouse.

[19] Distance is Chebyshev, matching eight-neighbor movement, written `d`.

```
food(c)    = Σ piles p            1 / (1 + d(c,p))
           + Σ traps t unknown    0.5 / (1 + d(c,t))

danger(c)  = Σ cats k in range    4 / (1 + d(c,k))²
           + Σ traps t known      2 / (1 + d(c,t))²

mate(c)    = Σ eligible q in range  1 / (1 + d(c,q))

shelter(c) = Σ free holes h       1 / (1 + d(c,h))

explore(c) = alignment of (c − position) with the mouse's momentum vector,
             the normalized sum of its last 8 displacements, mapped to [0,1]
```

[20] **Food and shelter fall off linearly, danger quadratically.** A smell should pull from across the room; a cat should dominate only near it and fade fast, so that a hungry mouse two rooms from a cat is not paralyzed. The constants 4 and 2 make a cat outweigh a known trap at equal distance, which matches what the mice should have learned.

[21] **Traps a mouse does not know about contribute to `food`, at half weight.** That is the deception, expressed directly: the same object is food to the naive and danger to the experienced, and which one it is depends entirely on that mouse's memory.

[22] **Each field is min-max normalized across the nine candidates before weighting.** Without this the weights would not be comparable, because a field with twenty contributing sources has a far larger raw range than one with two. Normalization is what makes Jev's probabilities mean what they appear to mean.

### 5.4 Movement

```
score(c) = w.eat      · food(c)
         − w.flee     · danger(c)
         + (w.hide + w.nest) · shelter(c)
         + w.mate     · mate(c)
         + w.explore  · explore(c)
         + 0.05 · rng()
```

[23] Weights are the drive probabilities Jev returned, used whole rather than reduced to the winner. Flee is the only negative term, because fleeing means maximizing distance from danger rather than moving toward anything.

[24] Candidate cells are the current cell and the eight neighbors, filtered: inside the grid, not occupied by another animal, never a cell holding a cat, and a mousehole only when the intent is hide or nest and that hole is free. The current cell is always a candidate, so a mouse with nothing attractive nearby can simply hold still.

[25] The jitter term is small on purpose. At 0.05 against normalized fields it breaks ties between equally good cells and adds a little life, and it cannot overturn a real gradient. It is configurable so that its contribution to the Brownian-motion risk can be measured rather than argued about.

### 5.5 Perception and memory

[26] Perception radius is Chebyshev distance: 6 for a mouse, 8 for a vigilant mouse, 8 for a cat. Food and shelter are smelled at any distance with the falloff above; cats, other mice, and corpses require line of sight in the sense of being within the radius, with no occlusion in this version because there is no terrain.

[27] A memory is a sentence plus metadata: kind, bearing, the tick it was formed, and whether it was seen or heard. Five per mouse, oldest dropped, each expiring 300 ticks after formation. Sentences are generated from templates so that Jev sees consistent phrasing:

| Kind | Sentence |
|---|---|
| Seen trap death | `You saw a mouse die in a trap to the {bearing}, {when}.` |
| Seen cat kill | `You saw a cat catch and eat a mouse to the {bearing}, {when}.` |
| Narrow escape | `You barely escaped a trap to the {bearing}, {when}.` |
| Heard, trap | `Another mouse warned you about a trap to the {bearing}, {when}.` |
| Heard, cat | `Another mouse warned you about a cat to the {bearing}, {when}.` |

[28] `{when}` is `just now` under 20 ticks, `a little while ago` under 100, and `a while ago` beyond that. Only sentences tagged seen are ever exchanged, which is the one-hop rule expressed where it cannot be forgotten.

## 6. The Jev contract

[29] This section is the exact wording. It is the part of the system most likely to need tuning against real behavior, so it lives in one file, `packages/engine/src/decisions/contract.ts`, and every string in it is covered by a test that asserts the request built from a fixture state matches a stored snapshot.

### 6.1 Bucketing

[30] No number ever reaches Jev. These tables are the whole translation layer, and they are the first thing to adjust when a decision looks wrong.

| Distance in cells | Word |
|---|---|
| 0 to 1 | `adjacent` |
| 2 to 3 | `very close` |
| 4 to 6 | `nearby` |
| 7 or more | `far` |

| Nutrition | Word |
|---|---|
| 90 to 100 | `full` |
| 60 to 89 | `fed` |
| 30 to 59 | `hungry` |
| 10 to 29 | `very hungry` |
| 0 to 9 | `starving` |

| Age in ticks | Word |
|---|---|
| under 30 | `a pup, too young to mate` |
| 30 to 200 | `a young adult` |
| over 200 | `a grown adult` |

[31] The nutrition boundaries at 60 and 30 are deliberately the same as the movement speed bands, so that the word Jev reads and the mechanical consequence change together. A mouse described as `hungry` is also, at that exact moment, a mouse that has begun to move slowly, and the model's judgment and the world's physics stay in step.

[32] Cat states are `prowling`, `stalking toward you`, `about to pounce`, `eating a mouse`, and `resting`. Shelter is `a free mousehole adjacent`, `... very close`, `... nearby`, `... far`, or `no free mousehole in reach`. Bearings are the eight compass words.

### 6.2 State sent for one mouse

```json
{
  "mouse": {
    "sex": "female",
    "age": "a young adult",
    "hunger": "hungry",
    "personality": "Cautious: flees early, avoids any place it remembers as dangerous, and prefers to forage near where it has eaten before.",
    "condition": "moving slowly because it is hungry",
    "pregnant": "carrying a litter, ready to give birth"
  },
  "surroundings": {
    "food": "a food pile nearby to the west; a food smell very close to the north",
    "cats": "a cat very close to the northeast, stalking toward you",
    "mice": "two other mice nearby; one is a healthy male, very close to the south",
    "shelter": "a free mousehole nearby to the southwest",
    "knownTraps": "a trap you know about, very close to the north"
  },
  "memories": [
    "You saw a mouse die in a trap to the north, just now.",
    "Another mouse warned you about a cat to the east, a little while ago."
  ]
}
```

[33] A batch nests up to eight of these under their agent ids, and every question in the batch names its subject by path, for example ``Consider the mouse at `m17`.`` The TypeSafe guidance on pointing a question at a nested value with a backticked path is followed exactly, because a batch is the one place where the model could otherwise confuse two subjects.

[34] **Only what that mouse can perceive or remember appears.** No coordinates, no tick numbers, no population counts, nothing about mice it cannot see. Large states full of irrelevant detail are a documented way to lose accuracy, and a mouse's world is small.

### 6.3 The questions

[35] Structured instructions and contrastive criteria throughout, following the pattern TypeSafe recommends: say what belongs in an option, what belongs in a neighboring option instead, and give an example or two.

```ts
// drive — asked on every mouse decision
choice({
  question: 'What should this mouse do right now?',
  focus: 'Weigh how hungry it is against the danger it can see or remembers, '
       + 'and account for its personality. Pick the one drive that fits this moment.',
}, {
  eat: {
    what: 'Go to food and eat it.',
    when: 'Hunger is pressing enough to be worth the trip, or food is close and safe.',
    not_for: 'A mouse that is full, or one that must escape an immediate threat first.',
    examples: ['A hungry mouse with a food pile nearby and no cat in sight.',
               'A starving mouse that will die without food soon.'],
  },
  flee: {
    what: 'Run away from the danger.',
    when: 'A cat is close enough to be a threat right now.',
    not_for: 'Remembered danger with no cat currently visible; that is a reason to be wary, not to run.',
    examples: ['A cat very close and stalking toward this mouse.'],
  },
  hide: {
    what: 'Run to a free mousehole and wait there, safe but unable to eat.',
    when: 'Danger is present, shelter is reachable, and this mouse can afford to wait.',
    not_for: 'A starving mouse, which would die waiting.',
    examples: ['A cautious mouse with a cat nearby and a free mousehole close by.'],
  },
  seek_mate: {
    what: 'Approach another mouse to mate.',
    when: 'This mouse is safe, well fed, and a suitable partner is visible.',
    not_for: 'A hungry mouse, or one with a cat in sight.',
    examples: ['A fed mouse with no danger nearby and a healthy partner very close.'],
  },
  nest: {
    what: 'Go to a free mousehole to give birth.',
    when: 'This mouse is carrying a litter and ready, and shelter is available.',
    not_for: 'Any mouse that is not carrying a litter.',
    examples: ['A pregnant mouse ready to give birth with a free mousehole nearby.'],
  },
  explore: {
    what: 'Wander into unfamiliar ground looking for food, mates, or shelter.',
    when: 'Nothing else is pressing.',
    not_for: 'A mouse with a clear immediate need.',
    examples: ['A fed mouse with no food, danger, or partner in sight.'],
  },
})
```

[36] Options are pruned before the request is built. `eat` appears only when some food is perceived, `flee` only when danger is present or a danger memory is fresh, `hide` and `nest` only when a free mousehole exists, `seek_mate` only for an eligible mouse with a visible candidate, `nest` only past gestation. `explore` is always present, so the option set is never empty and there is always a sensible answer.

```ts
// fear — asked on every mouse decision
score({
  question: 'How afraid should this mouse be right now?',
  focus: 'Judge fear from what it can see and what it remembers, and from its '
       + 'personality. This is about how much room it should give danger, '
       + 'not about what it should do.',
}, [
  { what: 'Unconcerned. Nothing threatening in sight or in memory.',
    signals: ['No cat visible', 'No remembered deaths nearby'] },
  { what: 'Wary. Something is off, but nothing immediate.',
    signals: ['A cat was around recently but is not visible now',
              'A remembered death some distance away'] },
  { what: 'Alarmed. Real danger is present or freshly remembered.',
    signals: ['A cat is visible and hunting', 'A mouse died nearby just now'] },
  { what: 'Panicked. Danger is immediate and close.',
    signals: ['A cat is adjacent or very close and coming',
              'This mouse just escaped a trap'] },
])
```

```ts
// approach_suspect_food — speculative; asked when the nearest food signal
// sits where this mouse remembers a death or an escape
noul({
  question: 'Should this mouse go to that food even though it remembers a death there?',
  compare: ['`mouse.hunger`', '`memories`'],
  focus: 'Weigh how badly this mouse needs food against what it remembers about that place.',
}, {
  true:  { what: 'Hunger outweighs the risk. Go.',
           examples: ['A starving mouse with no other food within reach.'] },
  false: { what: 'The risk outweighs the hunger. Stay away.',
           not_for: 'A mouse with no other option and no time left.',
           examples: ['A fed mouse that watched another mouse die in that trap just now.'] },
})
```

```ts
// mate_choice — speculative; options are the visible candidates plus none
choice({
  question: 'Which of these mice is the best partner for this one?',
  focus: 'Prefer a partner in good condition, close enough to reach safely. '
       + 'Take this mouse\'s own personality into account.',
}, {
  // one option per candidate, described in words, for example:
  m41: { what: 'A bold male, well fed, very close to the south, exploring.' },
  m58: { what: 'A cautious male, hungry, nearby to the west, heading for shelter.' },
  none: { what: 'None of them is worth approaching right now.',
          when: 'Every candidate is in poor condition, too far, or in danger.' },
})
```

```ts
// nest_site — speculative; asked when pregnant past term and beside a free hole
score({
  question: 'How safe is this mousehole as a place to give birth?',
  focus: 'Judge the ground around the hole: danger seen or remembered near it, '
       + 'and how exposed the approach is.',
}, [
  { what: 'Dangerous. A cat is near this hole, or a mouse died beside it just now.' },
  { what: 'Uneasy. Something troubling is remembered near here.' },
  { what: 'Reasonably safe. Nothing alarming nearby.' },
  { what: 'Safe. Quiet ground, nothing remembered, no danger in sight.' },
])
```

```ts
// cat target — asked when mice are in perception and the cat needs a decision
choice({
  question: 'Which mouse should this cat go after?',
  focus: 'Prefer a mouse that is easy to catch: slow, alone, out in the open, '
       + 'and close. A mouse heading for a mousehole may escape.',
}, {
  m17: { what: 'Moving slowly because it is hungry, alone, very close to the north.' },
  m23: { what: 'Moving at full speed, among three other mice, nearby to the east.' },
  none_worth_it: { what: 'No mouse here is worth chasing.',
                   when: 'Every mouse is fast, far, or about to reach shelter.' },
})

// cat mode — same request as target
choice({
  question: 'How should this cat move now?',
  focus: 'Match the approach to the distance and to how likely the mouse is to escape.',
}, {
  prowl:  { what: 'Wander and look for a better opportunity.' },
  stalk:  { what: 'Close on the chosen mouse steadily, one step at a time.' },
  pounce: { what: 'Spring two cells at the chosen mouse now.',
            when: 'Only when it is very close and the cat is not still recovering from the last pounce.' },
  rest:   { what: 'Hold still and wait.' },
})
```

[37] **How answers become behavior**, restating the requirements' contract in implementation terms: drive probabilities become the movement weights whole; the top drive becomes the intent label, flagged when confidence is under 0.5; the top fear level maps to a danger multiplier of 0.5, 1.0, 1.5, or 2.0 and, at panicked, halves the intent hold from 12 ticks to 6; a `false` on suspect food removes that source from the food field for the current intent; mate choice sets the approach target; a nest site of reasonably safe or better permits birth.

### 6.4 Baseline rules

[38] The substitution when Jev is off, over budget, timed out, or erroring. Same questions, same answer shapes, fixed weights, so that a baseline run differs from a Jev run in exactly one variable.

[39] **drive.** Evaluate top to bottom; the first matching row wins and supplies the probability vector. `dCat` is Chebyshev distance to the nearest visible cat, `dHole` to the nearest free hole.

| Condition | eat | flee | hide | seek_mate | nest | explore |
|---|---|---|---|---|---|---|
| `dCat ≤ 2` and `dHole > 4` | | 0.85 | | | | 0.15 |
| `dCat ≤ 4` and `dHole ≤ 4` | | 0.30 | 0.70 | | | |
| nutrition < 30 and food perceived | 0.90 | | | | | 0.10 |
| pregnant past term and hole free | | | | | 0.80 | 0.20 |
| nutrition < 60 and food perceived | 0.65 | | | | | 0.35 |
| eligible, candidate visible, nutrition ≥ 60, `dCat > 6` | | | | 0.60 | | 0.40 |
| otherwise | | | | | | 1.00 |

[40] **fear.** `unconcerned` with no cat visible and no danger memory under 100 ticks old; `wary` with no cat visible but such a memory, or a cat at distance 5 or more; `alarmed` at distance 2 to 4; `panicked` at 0 or 1.

[41] **approach_suspect_food.** True when nutrition is under 20, false otherwise. Deliberately blunt: the point of the baseline is to be obviously a rule.

[42] **mate_choice.** The nearest eligible candidate. **nest_site.** `safe` when no cat has been perceived within 100 ticks and no known trap lies within 5 cells, otherwise `uneasy`. **cat target.** Minimize `d + nutrition / 20`, so a slow mouse a little further away beats a healthy one underfoot. **cat mode.** `pounce` when the target is within 3 and the cooldown is clear, `stalk` when it is visible, `rest` for 10 ticks after losing one, `prowl` otherwise.

[43] Every baseline answer carries `source: 'baseline'` into the event, so the inspector and the tests can always tell which decisions were judged and which were computed.

## 7. Test strategy

### 7.1 The determinism suite

[44] Four tests, run as their own step in the checks, over a fixed fixture configuration and seed:

```ts
test('same seed and provider yields an identical event stream')
test('replaying a record reproduces its stream with zero provider calls')
test('snapshot round trip is invisible: 500 straight === 250 + restore + 250')
test('baseline and Jev runs on one seed diverge only at decision events')
```

[45] The third is the one that finds the bug nobody else would. Any piece of state omitted from the snapshot, any generator draw made out of order, any timer stored somewhere the serializer does not walk, shows up here as a diverging event stream and nowhere else.

[46] The Jev-facing tests use a recorded provider: a fixture of real responses captured once from the live service, replayed deterministically. No test hits the network, and the engine suite runs with no key present.

### 7.2 Computing the two behavioral metrics from a record

[47] Both metrics are computed by the same code the tests use and the analysis screens use, so a number on screen and a number in a test result can never disagree.

```ts
// Flee-or-hide under threat: at least 80% of qualifying decisions must put
// a combined 0.5 or more on flee plus hide.
export function fleeOrHideRate(record: RunRecord): Metric {
  let qualifying = 0, passing = 0
  for (const ev of record.events) {
    if (ev.kind !== 'decision_returned' || ev.source !== 'jev') continue
    for (const s of ev.subjects) {
      const cats = String(s.state.surroundings?.cats ?? '')
      const threatened = cats.includes('adjacent') || cats.includes('very close')
      const hunger = String(s.state.mouse?.hunger ?? '')
      const healthy = hunger === 'full' || hunger === 'fed'
      if (!threatened || !healthy) continue
      qualifying++
      const p = s.answers.drive.probabilities
      if ((p.flee ?? 0) + (p.hide ?? 0) >= 0.5) passing++
    }
  }
  return { qualifying, passing, rate: passing / qualifying, threshold: 0.8 }
}

// Personality mix: each type's share of every mouse that ever lived must be
// within 5 points of the configured percentage, once there are 100+ births.
export function personalityMix(record: RunRecord): Metric {
  const counts = countInitialSpawn(record.config)          // from run_started
  let births = 0
  for (const ev of record.events) {
    if (ev.kind !== 'birth') continue
    counts[ev.personality]++; births++
  }
  const total = sum(counts)
  const worst = maxBy(PERSONALITIES, (p) =>
    Math.abs(counts[p] / total * 100 - record.config.personality[p]))
  return { births, applies: births >= 100, worstDelta: worst, threshold: 5 }
}
```

[48] **Qualification is read from the words actually sent**, not from engine internals. That is deliberate: the metric asserts something about what Jev was asked and what it answered, which is the claim the showcase is making, and it stays true even if the bucketing boundaries move.

### 7.3 The rest

| Layer | What is tested | Where it runs |
|---|---|---|
| Engine mechanics | trap evasion odds over 10,000 seeded rolls, starvation timing, hole capacity, cap-limited births, memory expiry, one-hop alarms | Node |
| Contract | request built from a fixture state matches a stored snapshot; every answer shape applies correctly; option pruning | Node |
| Worker routes | the authorization matrix, cell by cell | Cloudflare pool, local bindings |
| Durable Objects | reserve and commit arithmetic under interleaving, midnight reset, queue admission and drain | Cloudflare pool |
| Container protocol | chunk report writes exactly one of each row, watchdog restart path | Cloudflare pool with a stub container |
| Browser | frame packing and unpacking round trip, chunk paging across a boundary, reconnect | Vitest browser mode |

[49] **The authorization matrix is tested cell by cell, not sampled.** Every route crossed with every caller kind, asserting the exact status. It is a table in the API design and a table-driven test here, which is the cheapest way to keep a sharing feature from leaking.

## 8. Observability

| Concern | Tool | Detail |
|---|---|---|
| Errors, all three runtimes | Sentry | Browser, Worker, and container, with trace propagation so a failed run links to the request that started it |
| Logs | Cloudflare Workers logs | Structured JSON, one line per request with run id and subject key, no personal data |
| Metrics | the `jev_usage` table | Cost and fallbacks per run and per day; the product's own telemetry covers the simulation |
| Alerts | Sentry | Sign-in failures above 10 percent over 15 minutes; Jev fallback rate above 50 percent over 15 minutes |
| Heartbeat | Worker cron, daily | One line to a private webhook: runs started, completed, failed, fallback rate, spend, storage used, queue high-water mark |

[50] **Two alerts, not ten.** These two cover the failures that are both silent and fatal to the point of the product: nobody can get in, and everybody is quietly watching hand-coded rules instead of the model. Everything else is visible in the daily line or in a dashboard when someone looks.

[51] **Sentry is configured to send no personal data.** `sendDefaultPii` off, the user context is the internal user id and nothing else, and the event scrubber drops cookie headers. The one exception worth stating: a run configuration attached to an error contains no personal data by construction, so it is attached in full because it is what makes an engine error reproducible.

## 9. Scaling and the ceiling

[52] The deployment is sized by two numbers and neither is about traffic. Twenty concurrent containers is the compute ceiling; the daily budget is the spend ceiling. Everything else, static assets, the API, sign-in, the record reads, is edge-served and effectively free at any traffic a showcase will see.

[53] **Where the ceiling actually is.** Each running simulation is one container and, at Medium with sixty mice on an eight-tick cadence, roughly one Jev request per tick. Twenty of those is twenty requests per second against a published limit of 1,200 per minute, so the rate limit binds at around sixty concurrent runs. The container cap of twenty is therefore the binding constraint, and it is a setting rather than a rewrite.

[54] **What to change first if it needs to grow.** Raise the container cap; the queue already exists and drains. After that, batch more aggressively per tile. After that, the decision cadence, which is a behavior change and needs its own thought rather than a setting.

[55] **Nothing in the system holds state that prevents a second Worker region or more containers.** The only singleton is the limits object, and it is a counter.

## 10. Compliance requirements

[56] Carried from the architecture unchanged, with one addition from the API design. These are not preferences.

[57] **HARD REQUIREMENT.** Only `openid`, `email`, and `profile` are requested from Google, and only the subject id, email, name, and avatar URL are stored.

[58] **HARD REQUIREMENT.** No analytics, tracking, pixels, or fingerprinting anywhere in the browser bundle.

[59] **HARD REQUIREMENT.** Secrets exist only as Worker secrets and container environment. A build-time check greps the client bundle for key patterns and fails the build on a hit.

[60] **HARD REQUIREMENT.** Sessions are 256 random bits, stored with a 30-day expiry, in HttpOnly, Secure, SameSite=Lax cookies. Anonymous cookies are signed.

[61] **HARD REQUIREMENT.** Every run route and every stream resolves ownership before acting. Share access is read-only.

[62] **HARD REQUIREMENT.** Container callbacks are authenticated with a per-run token, and container object-store credentials permit writing objects only, with no read, list, or delete.

## 11. Implementation sequence

[63] Ordered so that each stage is testable on its own and nothing is built before what it depends on. The first three stages need no Cloudflare account, no database, and no key.

1. **Engine skeleton.** Configuration and validation, generator, world, clock, tick order, events, chunk and summary writers. Headless, no agents yet.
2. **Mechanics.** Mice, cats, food, traps, mouseholes, nutrition, movement, perception, memory, reproduction, with the baseline provider only. The mechanics tests pass here.
3. **Snapshot and replay.** `serialize`, `restore`, and the determinism suite. Nothing further is built until the snapshot round trip is invisible.
4. **The Jev provider.** Bucketing, request composition, answer application, batching, timeout and fallback, against recorded fixtures first and the live service second.
5. **Container process.** `apps/sim`: loop, object writes, the chunk report, control handling. Runs against a stub coordinator locally.
6. **Worker foundation.** Hono, static assets, the schema and migrations, sessions and sign-in, `/api/me`. Deployable and signed into, with no simulation yet.
7. **Coordination.** The Run, quota, and limits objects, the internal protocol, run creation and lifecycle. End to end: a run starts, writes chunks, and completes with nobody watching.
8. **Viewer.** The socket, snapshot and frames, the canvas. A run is watchable.
9. **Inspector and charts.** The decision panel and the summary series. The showcase becomes legible.
10. **Library, replay, comparison.** Chunk paging, scrubbing, the two-run overlay, the baseline twin.
11. **Sharing, account, export, retention.** The sweep, deletion, and the retry queue.
12. **Public mode and hardening.** The auth flag, anonymous quotas, the authorization matrix test, the bundle secret check, Sentry, and the daily heartbeat.

[64] Stage 3 is the gate worth respecting. If the snapshot round trip is not invisible, everything after it inherits a defect that is nearly impossible to find once a network is in the picture.

## 12. Changes to earlier documents

[65] **A build-time secret scan** of the client bundle becomes a named check rather than an assertion in prose.

[66] **The explore signal is a momentum vector**, not a least-visited map. Cheaper, no per-mouse grid, and it produces the wandering the requirements describe.

[67] **Field falloff is specified**: linear for food and shelter, quadratic for danger, with the constants given. Earlier documents said only that signals fall off with distance.

[68] **Normalization across the nine candidate cells** before weighting is new, and it is what makes the drive probabilities behave as weights.

[69] **Decisions are applied in agent id order after all batches resolve.** Implied by determinism, never stated.

## 13. Open questions

[70] Whether the jitter constant should be configurable per run rather than global. Global is the proposal, with a setting for experiments.

[71] Whether the recorded Jev fixtures should be refreshed automatically when the model version changes, or deliberately. Deliberately is the proposal, since a fixture change is a behavior change and belongs in a commit someone reviewed.

[72] Whether `explore` should ever be pruned from the drive options. No is the proposal; it guarantees a non-empty option set.

[73] Whether the daily heartbeat should go to Discord or Slack. Either; the webhook is a setting.
