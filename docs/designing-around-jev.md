# Designing around TypeSafe Jev/System One

**Date:** 2026-09-20

This is a post about an AI system design. Not about mice.

[jev-mice](https://mice.jev.carsonsweet.com) is a tick-based ecology on a grid -- mice, cats, traps, food, mouseholes -- where every animal's next move is arbitrated by [Jev](https://typesafe.ai), TypeSafe's System One model, instead of by the usual pile of hand-written behavior rules. It is the second thing I have built this way, after the Brogue CE player (complex in its own way, and forthcoming). 

The mouse colony is where a specific pattern got tested:  sixty agents of multiple types, each with different goal and memory states each turn, and all needing a full state-driven decision from Jev every turn.



## The one design rule everything else falls out of

**Code owns anything with a clear right answer. Jev is asked only genuine judgment calls, over options code has already narrowed.**

That sentence is in the project's `CLAUDE.md` and it is load-bearing. Every design decision in the engine is downstream of it, and every time I have been tempted to soften it, softening it made the system worse.

Concretely, in `packages/engine/`: pathfinding, line of sight, chebyshev distance, nutrition arithmetic, hunger bands, gestation timers, trap evasion odds, population caps, the respawn clock, and which of the nine neighboring cells are legal to step into -- all code, none of it ever reaches the model. What Jev gets asked is: *given what this mouse can see and remember, what should it be trying to do right now?* Six options, and the answer is a typed distribution over them.

The failure mode I was designing against is the one where you hand an LLM the game state and ask it to play. That produces a system where you cannot tell whether a bad outcome came from bad judgment or bad arithmetic, and where every bug investigation starts with re-reading a paragraph of prose the model emitted. Narrowing first means a wrong answer is always a wrong *judgment*, which is the only interesting kind.

## Jev never sees a number

**Every value crossing the boundary is a bucketed word.** Not "4 cells away" but `very close`. Not "nutrition 31" but `hungry`. Not coordinates but `north-east`. `bucketNutrition`, `bucketDistance`, `bucketAge` and `catStateWord` in `decisions.ts` are the whole of the translation layer, and nothing else is allowed to construct a subject line.

This is not squeamishness about tokens. System One models are weak at arithmetic and numeric comparison in exactly the way they are strong at "which of these six things matters most right now," and a request full of numbers is an invitation to do the thing they are bad at. Giving Jev `three cells away, nutrition 31, cat at 12,7` invites it to compute. Giving it `a cat very close, and this mouse is hungry` asks it to judge. The second question is the one it can answer well, and it is also the only question I actually need answered, because I can do the arithmetic myself and I already did.

A useful side effect: the request is small. A batch of eight mice with full state, answers and weights is about 8KB recorded, roughly a kilobyte a mouse.

## The questions are a file, not a string in a function

`packages/engine/src/questions.ts` holds the exact wording of every question, separated from the code that assembles a request. Each drive gets four fields:

```
eat: {
  what: 'Go to food and eat it.',
  when: 'Hunger is pressing enough to be worth the trip, or food is close and safe.',
  not_for: 'A mouse that is full, or one that must escape an immediate threat first.',
  examples: ['A hungry mouse with a food pile nearby and no cat in sight.', ...],
}
```

Two reasons for the split. Changing what a mouse is asked becomes a change to one file, reviewable on its own, rather than a diff buried in request-assembly logic. And the tests can quote the criteria directly, so a test asserting behavior and the prompt producing that behavior cannot drift apart silently.

The `not_for` field earned its place. It is where the boundary between two drives gets stated once, in the place the model actually reads, instead of being implied by the ordering of a rule ladder. `hide` says `not_for: 'A starving mouse, which would die waiting.'` -- and months later, when I found a mouse oscillating in and out of a mousehole every turn until something ate it, the fix was not new logic. The engine's own rule ejected a mouse from shelter below the fed band while still offering `hide` as an available drive. The question's wording had been right the whole time and the code disagreed with it. `availableDrives` now stops offering `hide` below the same threshold that ejects. Two rules that should have been one.

## The baseline is a control, not a fallback

There is a complete hand-written rule ladder that answers every question Jev answers, and you can run any configuration through it by flipping a switch on the configuration screen.

It exists **so that the comparison is possible at all.** A demo where an AI model does something impressive is worthless without the version where it doesn't. Same seed, same world, rules instead of Jev, and you can watch the difference -- or fail to see one, which is also information.

It has two other jobs it turned out to be better at than being a comparison. It is what the deployment falls back to when the daily Jev budget runs out, so the site keeps working rather than refusing visitors. And it is what makes the engine testable: the entire 448-test suite runs against the rules, deterministically, in under a minute. If the only way to exercise the engine were to call a model, the test suite would be slow, flaky, and expensive, and I would have written fewer tests.

**Something I did not expect:** the baseline scores badly on one of the project's own success measures, and correctly so. SM-07 asks what fraction of the time an animal in immediate danger chooses to flee or hide. Jev is meant to clear 80 percent. The rules score about 36. Measured on a 1,764-turn run: 33 qualifying decisions, 12 passing. That is not a defect in the ladder -- it is structural. The flee row fires only at two cells or nearer and the hide row needs shelter within four, so a fed mouse with a cat at three cells and no shelter falls through to a danger floor of 0.167, below the 0.5 the measure wants. I could widen the rows and make the number go up. I decided not to: the measure exists to say whether *judgment* looks intelligent, and holding the deliberately dumb comparison to the same bar was never the point. The rules now report their rate without a verdict, as the baseline Jev's figure is read against.

## Batching, and the thing that made it 4x cheaper

Sixty mice deciding every turn is sixty requests a turn if you are naive about it, which at 2,000 turns is 120,000 requests and a rate-limit problem.

So mice are batched -- up to eight per request, `BATCH_SIZE = 8`. The interesting part is how you choose the eight. My first version confined a batch to a 16x16 tile of the grid, which is the obvious thing: mice near each other share context. **Measured, that produced 6.76 requests per tick.** Replacing tile confinement with a plain spatial sort -- order every mouse by position, take them eight at a time -- produced **1.74 requests per tick** for the same world. Nearly a 4x reduction, because tiles leave you with a lot of near-empty tiles each costing a whole request, and a sort never leaves a request less than full unless the population does.

Every mouse in a batch still gets its own subject line with its own state and its own answer. The batch is a transport optimization, not a semantic one.

## Fear divides distance; it does not scale the field

This one is worth writing down because I got it wrong first and the bug was invisible.

Each candidate cell gets scored on four fields -- food, shelter, mate, danger. Food and shelter fall off linearly (`1/(1+d)`, a smell should carry across the room); danger falls off quadratically (`1/(1+d)²`, a cat should dominate near it and fade fast). Those four scores are then min-max normalized across the nine candidate cells before the drive probabilities weight them, which is what makes a probability distribution behave like a set of weights.

My first implementation made a frightened mouse more afraid by **multiplying the danger field by a fear factor.** It had no effect whatsoever, and it took an embarrassing amount of staring to see why: normalizing across nine cells divides out any constant multiplier applied to all nine. A scared mouse and a calm mouse got identical fields.

Fear now divides distance instead -- `quadratic(d / f)` -- which makes a cat *feel* closer to a panicked mouse than to an unconcerned one. That survives normalization because it changes the shape of the falloff, not its scale. The general lesson, which I will be carrying into the next one of these: if your scoring pipeline normalizes, anything you apply uniformly before the normalize step is a no-op, and it will fail silently rather than loudly.

## Determinism, and what you give up

The engine is deterministic to the byte. Same seed, same configuration, same provider produces a byte-identical event stream. No clock, no `Math.random`, no network in the engine; every randomness-drawing loop iterates in ascending agent id order; decisions are applied in id order after all batches resolve. A 500-tick run on seed 4242 produces peak 82, min 45, 79 alive whether it runs on my laptop, in a local Worker, or on the deployment -- I check all three.

**You do not get this with Jev.** The model is self-consistent but not guaranteed identical, so the same seed twice gives two different worlds. This is the real cost of the pattern and it is worth being straight about. What I do about it: every Jev answer is recorded in the run's event stream, so a Jev run is exactly replayable *from its own record* even though it is not reproducible from its seed. Reproducibility and replayability are different properties and only one of them survives a model in the loop.

Determinism also bought something I did not anticipate. Because a rules run is a pure function of its configuration and seed, "what are the chances this colony survives" is not a hand-wave -- it is the fraction of seeds that survive, and you can go and measure it. I swept 864 configurations across 16 seeds each, 13,824 runs, recording for each the turn its last mouse died. The configuration screen now reads that table and tells you "Survived 13 of 16 measured runs" before you press start. A count rather than a percentage, because sixteen seeds put a reading of "half" inside roughly plus or minus twenty-five points and `50%` hides that where `8 of 16` does not.

## What the ecology taught me, which was not what I expected

Three results, all measured, all of which contradicted something I believed when I wrote the defaults.

**Shelter is the strongest single lever, stronger than food.** On the small map, everything else held equal, 12 mouseholes leaves half of all seeds extinct and 24 leaves none. I had been tuning food supply.

**A predation-limited colony is stable; a starvation-limited one decays.** Fast food respawn with more cats holds a population at its level across a long run. Slow respawn with fewer cats looks healthier early and then thins out. The shipped defaults therefore have more cats than feels intuitive.

**There is no predator-prey cycle.** This is the one I was most confident about and it is simply not there. Over 4,000 turns on the defaults the cat count never moved off 3 while the mice swung between 45 and the cap of 160. The textbook oscillation needs the predators to crash when the prey thin out, and the shipped settings never let that happen. You can produce the crash by starving the map, but then the colony usually goes with it. I wrote the opposite into the user guide first, went to check it, and had to take it back out.

Also worth knowing: **extinction is late.** Every configuration measured survives 800 turns, and they only separate after 1,800. A run that looks healthy at turn 500 tells you nothing at all.

## What it costs and what it costs you in time

Measured on the deployment, medium preset, rules baseline for throughput and real Jev for the rest:

- **Throughput with the rules: ~330 ticks/second.** With Jev: **6.2 ticks/second.** Jev is the bottleneck by a factor of about fifty, and no speed control changes that -- the pacer is not what is slow.
- **A 2,000-tick Jev run:** roughly 1,000-2,000 requests and 1.4-3.8 million input tokens, depending on how much of the run the colony spends at full strength.
- **A 20,000-tick Jev run takes about 54 minutes** whatever the speed slider says. If you want long Jev runs watchable end to end, the lever is batching or run length, not pacing.

The frame cadence bug that came out of this is instructive. Frames were emitted every `round(requestedSpeed / 20)` ticks -- correct if the run achieves the speed you asked for. With Jev it does not, so asking for 334 ticks a second set the interval to one frame every seventeen ticks, and at six ticks a second that is five to eight seconds of a frozen picture. **Turning the speed up made the viewer slower while the run went no faster.** The fix is that elapsed time is now the backstop: a frame goes out on the tick interval or after a twentieth of a second, whichever comes first. Any cadence derived from a *requested* rate has this bug latent in it the moment something else becomes the bottleneck.

## Where it runs

The whole thing is one Cloudflare Worker. The engine runs inside a Durable Object, advancing a batch of ticks per alarm, writing chunks to R2 and pushing frames over hibernatable WebSockets, so a run nobody is watching costs its storage and nothing else.

The original design put the simulation in a Cloudflare Container, on the reasoning that a simulation is a long-running process and Worker isolates cap CPU per invocation and memory at 128MB. I replaced that, and the three things that made it possible are worth naming because two of them were accidents:

1. `packages/engine` imports **nothing** -- no `node:` modules, no packages -- and the Jev provider is fetch-based. Both run on the Workers runtime unchanged. That was deliberate.
2. Events drain into chunks as they are produced, so live memory is bounded by chunk size rather than run length. That was a fix for a 136MB buffer, not a platform decision, and it happened to remove the memory objection.
3. Snapshot and resume already existed and are verified byte-identical -- 500 ticks equals 250 plus a restore plus 250. So a design that stops every few hundred ticks and resumes is not a compromise the platform imposed; it is what the engine was already built and tested to do.

An image, a registry, a build step, the container compute bill and one credential all came out of the design, and what it cost was a bound on batch size.

## Scope limits and things I would do differently

- **A Jev run is not reproducible from its seed,** only replayable from its record. If you need reproducibility, you need the rules.
- **The survival table only covers the rules,** and only four axes -- cats, mouseholes, food piles, respawn. Move the personality mix, the decay rate or the starting nutrition and the estimate says so and becomes a rough guide. The four-way personality grid would have multiplied the sweep several times over and I judged it not worth the compute. That may be wrong; personality plausibly matters a lot.
- **The cat axis is a cliff, not a slope.** Two cats left the colony alive on all 16 seeds and three killed it on all 12, at the same food settings. Any interpolated estimate near that boundary would be confidently wrong, which is why the estimator refuses rather than guesses there.
- **No accounts yet.** Sign-in, per-user run libraries and quotas are all designed and all behind a flag, and the public deployment runs without them. One shared daily Jev budget stands between a shared link and a surprise bill.
- **I would design the frame cadence from achieved rate from the start.** Deriving anything from a requested rate is a bug waiting for a slow dependency.

## The short version

The pattern that works is not "let the model drive." It is: compute everything computable, narrow the situation to a handful of real options, hand those options to Jev as a typed question in words rather than numbers, and keep a hand-written baseline that answers the same question so you can always tell what the judgment is actually worth.

The mice are just the test harness.

