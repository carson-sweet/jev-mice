---
title: jev-mice Product Brief
version: 2.0
status: deprecated
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: major. The product is now a hosted multi-tenant web service with accounts, server-side simulation, a shared run library, and link sharing, rather than a single-user local application. Sections 1, 2, 4, 7, 8, 9, 10, and 11 rewritten; a new section 8 covers the service around the simulation; the mechanics and personality sections carry forward unchanged.
previous_file: jev-mice-product-brief-deprecated-v1.3-20260919.md
---

# jev-mice Product Brief

**Version:** 2.0 (draft)

**Date:** 2026-09-19

**Work item:** WI-001

**Audience:** Internal now, written to be published alongside the project.

## 1. Executive Summary

jev-mice is a hosted web application in which mice, cats, traps, food piles, and mouseholes interact on a fixed grid for a configured number of ticks. Every mouse and cat decides what to do by asking Jev, TypeSafe's System One decision model, which returns calibrated probabilities over a short list of drives instead of generating text. Code turns those probabilities into movement.

The point of the project is to show that a fast, inexpensive, calibrated decision model can drive dozens of agents at once with behavior that reads as intelligent, and to make every one of those decisions visible and inspectable. It is a demonstration, not a game and not a validated ecology model.

A person signs in with Google, sets up a colony, and watches it live. The simulation runs on the server, one process per run, so a run outlives the tab that started it, survives a dropped connection, and keeps going while nobody is looking. Runs accumulate in a library that follows the person across machines. Any run can be shared by link with someone who has no account, replayed tick by tick, or set beside another run to see what one changed setting did.

Four audiences: Carson, testing where model-driven agents stop looking intelligent; developers evaluating TypeSafe for agent-like work; people who want to watch a colony live and die and then change one thing; and researchers who need reproducible, exportable runs.

What makes it different from its neighbors: the animal's mind is a decision model rather than a neural net or a prose-reasoning loop; movement blends the model's whole probability distribution rather than acting on the winner alone; personality and memory are plain sentences the model reads directly; every run is recorded and replayable; and a code-only twin of any run, on the same seed, shows exactly what the model added.

## 2. Problem Statement

Simulations of many autonomous agents come in two shapes, and neither serves the people this is for. Large language model agents produce believable behavior but are slow, cost real money per simulated hour, and hide their reasoning inside prose. Hand-coded utility agents are fast and legible but have no judgment: every tradeoff is a formula someone tuned. Nobody has shown a calibrated decision model driving a population where the tradeoffs are the model's and the audience can see them.

Three scenarios ground the problem.

A watcher set 70 percent of the mice to be bold. By tick 600 the population had collapsed and the deaths chart was dominated by traps. They suspect boldness fed the traps. Their only test today is to rerun with a different mix and eyeball it, and two runs with different seeds are not comparable, so the rerun proves nothing. They need runs that share a seed, differ in one setting, and sit side by side.

A developer considering the model for non-player-character decisions watches a hungry mouse walk past a cat that is eating another mouse, straight toward a food pile. They want to know whether the model weighed hunger against fear or a scripted heuristic did. Demonstrations hide their reasoning, and this model produces no reasoning text at all, only probabilities, so unless they can see the state sent and the distribution returned there is nothing to believe.

Carson, on the first sixty-mouse run, sees the colony jitter like Brownian motion instead of behaving like animals. Four stages could be at fault: the model's judgment, the translation of numbers into words, the blending of weights, or how often decisions are made. Nothing in a typical simulation interface isolates which stage produced the bad movement.

A fourth demand comes from hosting the thing. A twenty-thousand-tick run takes long enough that nobody will sit and watch it, and a browser tab is the wrong place to keep it alive. A run has to survive the tab, the network, and the process that runs it.

## 3. Target Audience

**Carson.** Wants to find where model-driven judgment stops looking intelligent as the population grows. Cares about how often decisions are made, what they cost, and whether blended movement reads as behavior rather than noise. The only audience that will change the design based on what the simulation reveals.

**A developer evaluating TypeSafe.** Wants the exact state and questions sent, the probabilities returned, and the cost per decision, for one animal at one moment. The inspector exists for this person, and so does the ability to send them a link with no sign-up in the way.

**Someone curious about emergent behavior.** No interest in the interface to the model. Sets up a scenario, watches, changes one starting condition, compares. Charts, replay, and the run library exist for this person.

**A researcher.** Uses the simulation as an experimental apparatus. Needs reproducible seeds, exportable records, and documented mechanics so a result can be cited or repeated.

**Not for:** anyone who wants to control an animal, anyone who needs biological fidelity, anyone who wants to define new species or rules, and anyone looking for a collaborative tool. One person owns a run; others can watch it.

## 4. Solution Overview and Positioning

**The split.** Code owns everything with a clear right answer: pathfinding, arithmetic, capture and evasion rolls, perception, timers, and reflexes. The model owns the gray zone: which drive wins for this animal right now, how afraid it should be, which mate is best, whether a mousehole is a safe place to give birth, whether to approach a food smell where a mouse died.

**Reflexes never reach the model.** A cat in an adjacent cell means flee. Standing on food while hungry means eat. Nutrition at zero means death.

**One request per decision, several questions inside it.** Code builds a small state of bucketed words, never raw numbers, and asks a set of independent questions that the model answers in parallel: a choice among the drives that are possible right now, a rating of fear, and speculative questions read only when relevant.

**Movement blends the whole distribution.** The probability of each drive becomes the weight on a corresponding signal field. A mouse at 0.6 eat, 0.3 flee, 0.1 mate moves along the blended gradient. Hunger countering fear becomes the model's judgment rather than a hand-tuned curve.

**Decisions are event-driven.** The model sets an intent; code executes it until something salient happens or the intent has run twelve ticks. This is how animals behave, and it cuts traffic by roughly eight times against deciding every tick.

**Personality is text, and memory is sentences.** Each mouse carries a short description the model reads directly, and a rolling list such as "You saw a mouse die in a trap to the west, just now." Mice that meet exchange what they have seen, so fear spreads socially.

**The simulation runs on the server.** One process per run, with its own memory, writing the record to storage as it goes and streaming frames to whoever is watching. The browser draws and nothing else. This is what lets a run be long, survive a closed tab, and be shareable.

**Positioning.** Against prose-reasoning agent demonstrations, this is the same idea of remembered experience driving behavior, delivered as calibrated probabilities in about a tenth of a second at a published $0.042 per million input tokens, instead of prose at seconds and dollars. Against agent-based ecology simulations, it adopts their vocabulary of sliders, population charts, an inspectable creature, and one-variable comparison, and replaces the hand-coded or evolved brain with a judgment the audience can read.

## 5. Simulation Model and Mechanics

**World.** A fixed rectangular grid chosen in configuration from three presets: Small at 48 by 32 cells, Medium at 80 by 50, Large at 120 by 75. The viewport scales the rendering to fit the screen; the world never changes size with the screen. This replaces the original "max mice from screen size" idea, because a world that follows the viewer's monitor makes runs incomparable across machines. Population caps derive from grid area: one mouse per 25 cells, one food pile per 50, one trap per 100, one cat per 400. On Medium that is 160 mice, 80 food piles, 40 traps, and 10 cats.

**Mouseholes.** Static cells placed at random at run start, count set in configuration, default 12 on Medium, cap one per 50 cells. Food and traps never spawn on a hole and cats never enter one. A hole holds one adult or one brood, never both. Mice smell free holes the way they smell food. A hiding mouse cannot be captured, still sees and hears, keeps getting hungrier, and leaves when nutrition falls below 60 percent. A cat whose target reaches a hole loses it and rests.

**Tick clock.** One tick is one unit of simulated time across the whole world. Every activity costs a whole number of ticks, and the run ends after the configured tick count.

| Activity | Ticks | Source |
|---|---|---|
| Mouse moves one cell at nutrition 60 percent or above | 1 | Carson |
| Mouse moves one cell at nutrition 30 to 59 percent | 2 | proposed |
| Mouse moves one cell below 30 percent | 3 | proposed |
| Cat moves one cell | 1 | Carson |
| Cat pounce, two cells, then 20-tick cooldown | 1 | proposed |
| Mouse eats a food pile, stationary | 3 | proposed |
| Cat eats a caught mouse, stationary | 10 | Carson |
| Dead mouse occupies a trap, then the trap respawns | 10 | Carson |
| Mating, both stationary | 5 | proposed |
| Gestation | 60 | proposed |
| Birth at a nest site, female stationary | 5 | proposed |
| Juvenile period before a mouse may mate | 30 | proposed |
| Cat rest after a failed chase | 10 | proposed |
| Cat drops a target it has not closed on | after 30 | proposed |
| Food pile respawn after being eaten | 40, configurable, 0 means never | proposed |
| Memory sentence expires | 300 | proposed |

**Nutrition.** Starts at 100 percent. Decays 0.5 points per tick, so an unfed mouse starves in 200 ticks. Eating a food pile restores it to 100 percent. Speed bands at 60 and 30 percent slow the mouse as above, which is what makes hungry mice easier for cats to catch. At zero the mouse dies of starvation.

**Movement and capture.** Eight-neighbor movement. Each tick, an animal that is due to move picks the neighboring cell with the highest weighted signal, with a small random jitter to break ties. A cat that moves into a mouse's cell captures it. Mice and cats share a base speed of one cell per tick, so a healthy mouse fleeing straight away is safe until it is cornered, slowed by hunger, or forced to route around known danger; the cat's pounce and the mouse's hunger are what tip the chase.

**Food and traps.** A food pile feeds one mouse once and is consumed. It respawns after the configured interval at a random empty cell, or never if the interval is zero, which turns the run into a starvation countdown. A live trap emits half of a food pile's food signal. A mouse that enters a trap cell rolls to evade: 50 percent at full nutrition, scaling linearly with nutrition. A failed roll kills the mouse, which stays visible in the trap for 10 ticks; the trap then respawns at a random empty cell at least five cells from any mouse. Cats do not trigger traps and do not eat food piles.

**Perception and memory.** Mice see everything within 6 cells; cats within 8. Food and trap signals are smelled without a range limit but fall off with distance. A trap is only recognized as a trap, rather than as a food smell, by a mouse that can currently see a dead mouse in it or that has a memory sentence about a death at that location. A death within a mouse's perception adds a sentence to its memory. Memory holds the five most recent sentences; each expires after 300 ticks. Two adjacent mice exchange their most recent seen danger memory, tagged as heard rather than seen; heard memories are never passed on again.

**Drives.** Survive outranks reproduce, and within survive, feed and avoid danger compete; within reproduce, find an optimal mate and find a safe nest compete. Jev arbitrates all of it except the reflexes. The state Jev receives says things like "very hungry," "a cat is close to the northeast and stalking toward you," "food smell to the west where a mouse died recently," and "bold." Hunger counters fear because Jev weighs them, not because a formula does.

**Reproduction.** A mouse may mate after its 30-tick juvenile period. A mouse whose drive lands on seek mate asks Jev to pick among visible eligible candidates, described in words by personality, condition, and distance, and approaches the winner. Mating occurs when the two are adjacent, the other mouse is not fleeing or eating, and a free mousehole lies within three cells; both stand still for 5 ticks. The female gestates for 60 ticks, then her nest drive activates and leads her to the nearest free hole, where Jev scores the surroundings; at reasonably safe or better she gives birth into the hole after 5 stationary ticks. With no free hole there is no birth, and the nest drive waits its turn against eating and fleeing. A litter is 2 to 4 pups born at 75 percent nutrition, sex assigned evenly at random, personality drawn from the configured percentages. Pups stay in the hole until hunger takes them below 60 percent, about 30 ticks, then emerge as full agents; the hole frees when the last one leaves. The mother stays outside. Births that would exceed the mouse cap are lost and logged as cap-limited.

**Cats.** A cat prowls on a random walk with momentum, drifting back toward where it last saw a mouse for up to 30 ticks after losing one, until a mouse outside a hole is in perception; then it asks Jev for a target and a mode. Stalking closes distance at one cell per tick; pounce covers two cells once, then cools down for 20 ticks. A cat that has not closed on its target within 30 ticks drops it, a target that reaches a mousehole is lost, and a cat whose target is lost rests for 10 ticks before prowling again. After a capture the cat eats for 10 ticks, stationary and visible, then hunts again. Cats never starve or die in this version; they are constant pressure.

**Fear learning.** There is no fear counter. A mouse that saw a trap death carries the sentence, and Jev's approach-suspect-food judgment and fear Score respond to it. A mouse that saw a cat eating carries that sentence and flees earlier. Jev's fear Score sets how wide a berth the mouse keeps: its highest-probability level maps to a fixed multiplier on the danger field's reach, and a panicked mouse re-decides after 6 ticks instead of 12. Telemetry records mean fear across the population over time so the learning is observable.

## 6. Configuration and Personality Mix

**Run knobs.** Grid preset; tick count (default 2,000); random seed; male mice; female mice; cats; traps; food piles; mouseholes; food respawn interval; nutrition decay rate; personality percentages; Jev on or off (baseline mode). Defaults for Medium: 30 male, 30 female, 4 cats, 8 traps, 20 food piles, 12 mouseholes, respawn 40, decay 0.5.

**Personality catalog.** Four types in this version, each a description Jev reads verbatim. Bold: approaches food despite nearby danger, explores far, slow to flee. Cautious: flees early, avoids any remembered danger, forages near where it has eaten before. Vigilant: notices danger sooner (perception 8 instead of 6), shares alarms readily. Social: seeks out other mice, exchanges memories at two cells instead of one, seeks a mate as soon as eligible.

**Percentages.** The user sets a percentage for each type; the four must sum to 100. Every mouse spawned at the start and every pup born during the run draws its personality from those percentages. Offspring do not inherit from parents in this version; an inherit-from-parents toggle is listed under Additional Development because it would turn the simulation into a selection experiment, which is a different product promise.

**Baseline mode.** With Jev off, every decision falls to the code-only reflex and utility rules with fixed weights. Same seed, same config, same engine. This is the control group for the showcase argument and the fallback when the TypeSafe API is unavailable.

**Export and import.** A run's full configuration and seed export as one JSON file and import back. Two people with the file get the same world.

## 7. Telemetry and Analysis

**Everything is an event.** The engine emits a typed event for every state change: every move, every decision with the exact state sent and the exact probabilities returned, every meal, trap, capture, birth, death, memory, and alarm.

**Records are written as the run goes.** Events accumulate into compressed chunks of a few hundred ticks, written to storage at each boundary, so nothing is held whole in memory and nothing is lost if a process dies. Alongside them, a compact per-tick summary carries the numbers the charts draw.

**Runs are replayable and comparable.** Because every answer the model gave is stored, a run replays exactly, with no further calls to the model. Two runs load side by side with every differing setting highlighted and their curves overlaid. That is what makes changing one thing and seeing what happened an actual experiment rather than an impression.

**The inspector is the point.** Clicking any animal shows what it perceived, what it remembers, the question it was asked, the full distribution it got back, and the move that resulted. Nothing is reworded between the model and the screen.

**Cost is always visible.** Requests, tokens, and dollars tick up live and are stored with the run.

## 8. The Service Around the Simulation

**Accounts.** People sign in with Google. The only personal data kept is the Google identifier, email address, name, and avatar. Nothing else is collected, and there is no analytics or tracking anywhere in the product.

**A library that follows you.** Runs belong to the person who started them and are available from any machine they sign in on. Runs are kept thirty days, with a warning badge in the final week, and can be exported to keep indefinitely.

**Sharing by link.** Any run can be given an unguessable link that lets someone watch or replay it, including the inspector, without an account. The owner can revoke it at any time. This is how an evaluator sees the thing without signing up for anything.

**Public mode.** The deployment can be opened to anonymous visitors with one setting. They get the full simulation under tighter limits, their runs live for a day, and nothing about them is kept beyond that. Sharing is unavailable in that mode.

**Bounded cost.** Every run's model usage is metered against a daily budget per person, per address, and for the deployment as a whole. When a budget runs out, runs continue on the code-only rules with a banner explaining why. A budget never breaks a run; it changes who is making the decisions.

**Leaving cleanly.** A person can see everything stored about them, export it, and delete their account, which removes every run, record, link, and stored object belonging to them.

## 9. Success Criteria

Eighteen checks, each evaluable as true or false after shipping, are specified in the requirements document. They divide into four groups.

**The simulation is believable and the model is doing the work.** Threatened healthy mice overwhelmingly choose to flee or hide. The personality mix holds across births. Every death has exactly one cause.

**The judgment is visible.** Any animal can be clicked to show the exact state, questions, and probabilities of its latest decision. A run replays exactly from its record with no further model calls. Two runs differing in one setting compare side by side, including a run against its own code-only twin.

**The service holds up.** A run completes at a usable speed, survives the tab closing, resumes after its process is killed, reconnects without losing place, and costs under fifty cents.

**Nothing leaks and nothing lingers.** No route returns another person's data. Deleting an account removes everything. Anonymous runs are gone within a day. No secret reaches the browser.

## 10. Risks and Assumptions

**Blended probabilities read as behavior, not jitter.** If wrong, the demonstration undercuts the very thing it argues for. Mitigated by the code-only twin for direct comparison, the flee-or-hide check, a per-decision log that isolates each stage, and a tunable jitter term.

**Decision cadence keeps a run watchable within the published rate limit.** If wrong, runs crawl. Mitigated by batching neighbors into one request, by measuring throughput at sixty mice, and by the ability to trade tick rate for population.

**Replay from stored answers makes runs comparable.** The model is self-consistent but does not guarantee identical answers, so comparisons are always between stored records, never between a record and a fresh run.

**Bucketed words carry enough signal.** If wrong, decisions look arbitrary in the inspector. The fix is the bucket boundaries and the question wording, not the model.

**Server-side simulation costs money per run.** Twenty concurrent runs is the ceiling, and it is a setting. If the demonstration ever gets real traffic, that number and the daily budget are the two dials.

**Personal data changes the obligations.** The product now holds names and email addresses. Collecting the minimum, deleting completely, and adding no tracking are treated as requirements rather than preferences.

**Twelve mouseholes for sixty mice produces real contention without stalling reproduction.** If wrong, either hiding is free or the colony cannot replace itself. Both are visible in the telemetry and the default is a setting.

**Cats are constant pressure.** They do not starve or die, so a high cat count is a guaranteed extinction. That is acceptable for a demonstration and is a dial the person controls.

## 11. Additional Development

Wireframes for the nine screens, and a review of the resulting experience. Full user stories with acceptance criteria. Validation that the solution is buildable as specified. Accessibility beyond the baseline. A mobile layout.

Delivered since the previous version: the system architecture, the user flows, the data model, the interface contracts, the exact wording of every question put to the model, the code-only rule weights, the test strategy, and the operating model.

Deliberately still out: personality inheritance and the lineage view it would enable, terrain beyond mouseholes, teams or shared ownership, identity providers other than Google, and any public listing of other people's runs.
