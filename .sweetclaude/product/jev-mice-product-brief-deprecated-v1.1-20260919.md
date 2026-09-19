---
title: jev-mice Product Brief
version: 1.1
status: deprecated
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: removed process vocabulary (phase names, gate, 'concrete moments') so the brief reads on its own
previous_file: jev-mice-product-brief-deprecated-v1.0-20260919.md
---

# jev-mice Product Brief

**Version:** 1.1 (draft)

**Date:** 2026-09-19

**Work item:** WI-001

**Audience:** Internal now, written to be published with the showcase repository.

## 1. Executive Summary

[1] jev-mice is a browser simulation in which mice, cats, traps, and food piles interact on a fixed grid for a configured number of ticks. Every mouse and cat decides what to do by asking Jev, TypeSafe's System One decision model, which returns calibrated probabilities over a short list of drives instead of generating text. Code turns those probabilities into movement.

[2] The point of the project is to show that a fast, inexpensive, calibrated decision model can drive dozens of agents at once with behavior that reads as intelligent, and to make every one of those decisions visible and inspectable. It is a demo and showcase, not a game and not a validated ecology model.

[3] Four audiences: Carson, testing where Jev-driven agents stop looking intelligent; developers evaluating TypeSafe for agent-like workloads; people who want to watch a colony live and die and then change one thing; and academic researchers who need reproducible, exportable runs.

[4] What makes it different from the neighbors in the competitive survey: the animal's mind is a System One model rather than a neural net or a prose-reasoning loop; movement blends the model's full probability distribution rather than acting on the winner; personality and memory are plain sentences the model reads directly; every run is telemetry-first and replayable; and a code-only baseline mode on the same seed shows exactly what the model adds.

[5] The deliverable is a pure TypeScript engine with a seeded random number generator, a browser front end that runs the loop and renders on canvas, and a small server-side proxy that holds the TypeSafe key.

## 2. Problem Statement

[6] Simulations of many autonomous agents currently come in two shapes, and neither serves the people this project is for. Large language model agent demos such as Generative Agents, AI Town, and Project Sid produce believable behavior but are slow, cost dollars per simulated hour, and hide their reasoning inside prose. Hand-coded utility AI, as in NetLogo or biosim4, is fast and legible but has no judgment: every tradeoff is a formula someone tuned. Nobody has shown a calibrated decision model driving a population where the tradeoffs are the model's and the audience can see them.

[7] Three scenarios make the problem concrete.

[8] An emergence watcher set 70 percent of the mice to be bold. By tick 600 the population had collapsed and the deaths-by-cause chart was dominated by traps. They suspect boldness fed the traps. Today their only test is to rerun with a different mix and eyeball it, and two runs with different seeds are not comparable, so the rerun proves nothing. They need runs that share a seed, differ in one knob, and sit side by side.

[9] A TypeSafe evaluator considering Jev for non-player-character decisions watches a hungry mouse walk past a cat that is eating another mouse, straight toward a food pile. They want to know whether Jev weighed hunger against fear or a scripted heuristic did. Agent demos hide reasoning, and Jev produces no reasoning text at all, only probabilities, so unless they can see the state sent and the distribution returned there is nothing to believe. Today they would read the source or trust the marketing.

[10] Carson, on the first 60-mouse run, sees the colony jitter like Brownian motion instead of behaving like animals. Four stages could be at fault: Jev's judgment, the bucketing of numbers into words, the blend weights, or the decision cadence. Nothing in a typical simulation UI isolates which stage produced the bad movement. Today the workaround is console logging.

[11] The product exists to answer those three scenarios: comparable runs, visible judgment, and a per-decision log that isolates each stage.

## 3. Target Audience

[12] **Jev boundary-tester.** Carson. Wants to find where System One judgment stops looking intelligent when it drives dozens of agents. Cares about decision cadence, token cost, and whether blended-probability movement reads as behavior rather than noise. The only audience that will change the design based on what the simulation reveals.

[13] **TypeSafe evaluator.** A developer deciding whether Jev fits an agent-like or simulation workload. Wants the exact state and questions sent, the probabilities returned, and cost per decision for one animal at one moment. The visible-judgment panel exists for this person.

[14] **Emergence watcher.** No interest in the API. Sets up a scenario, watches, changes one starting condition, compares. Wants charts and replayable runs. Telemetry and run comparison exist for this person.

[15] **Academic researcher.** Uses the simulation as an experimental apparatus. Needs reproducible seeds, exportable telemetry, and documented mechanics so a result can be cited or re-run. Sharpens the telemetry requirement into reproducibility and export.

[16] **Not for:** anyone who wants to control an animal, anyone who needs biological fidelity, and anyone who wants to define new species or rules.

## 4. Solution Overview and Positioning

[17] **The split.** Code owns everything with a clear right answer: pathfinding, nutrition arithmetic, capture and evasion rolls, perception, timers, and reflexes. Jev owns the gray zone: which drive wins for this animal right now, how afraid it should be, which mate is best, whether this spot is a safe nest, whether to approach a food smell where a mouse died. This is the same split the sibling project jev-plays-brogue proved: code narrows the options, Jev picks among them, and asking Jev about things it does not need to weigh degrades its judgment on the things it does.

[18] **Reflexes bypass Jev entirely.** A cat in an adjacent cell means flee. Standing on food while below full nutrition means eat. Nutrition at zero means death. None of these reach the model.

[19] **One request per decision, several questions inside it.** When a mouse needs a decision, code builds a small state object of bucketed words (never raw numbers, distances, or coordinates, because TypeSafe documents Jev as weak at arithmetic and numeric comparison) and asks a fan-out of independent questions that Jev evaluates in parallel: a Choice over the drives that are possible right now (eat, flee, hide, seek mate, nest, explore), a Score for fear with levels unconcerned, wary, alarmed, panicked, and speculative questions code reads only when relevant, such as which visible mate is best, whether the current location is a safe nest, and whether to approach a suspect food source. Code prunes the drive menu first: no visible mate means no seek-mate option.

[20] **Movement blends the whole distribution.** A Choice returns a probability for every option. Those probabilities become the weights on four signal fields: food, danger, mate, and nest. A mouse at 0.6 eat, 0.3 flee, 0.1 mate moves along the blended gradient. This makes "hunger counters fear" the model's judgment rather than a hand-tuned curve, and it gives each mouse smooth, individually varied movement.

[21] **Decisions are event-driven.** Jev sets an intent; code executes it tick by tick until a salient event forces a new decision: a cat enters or leaves perception, food is reached, nutrition crosses a band, a death is witnessed, an alarm is heard, a mate appears, gestation completes, or the intent has run 12 ticks. This is how animals behave, it cuts model traffic by roughly eight times against a per-tick design, and it keeps a large run inside TypeSafe's published limit of 1,200 requests per minute.

[22] **Personality is text.** Each mouse carries one of a small set of personality types, each a short description Jev reads as part of the state. Jev handles words natively, so bold and cautious mice diverge in behavior without any numeric tuning.

[23] **Memory is sentences.** Each mouse keeps a short rolling list such as "Saw a mouse die in a trap to the west." Witnessing adds a sentence. Mice that meet exchange their most recent danger memory, so fear spreads socially rather than only through direct witnesses. This deliberately echoes the memory stream in Generative Agents, at a fraction of the latency and cost.

[24] **Cats use Jev too, sparingly.** Target selection is a Choice over visible mice described in words (slow, isolated, near cover, in a group) plus a none-worth-it option. Mode is a Choice among prowl, stalk, pounce, and rest. A cat commits to a target until it is caught or lost.

[25] **Positioning.** Against LLM agent simulations, jev-mice is System One agents against System Two agents: the same idea of remembered experience driving behavior, delivered as calibrated probabilities in about 100 milliseconds at TypeSafe's published $0.042 per million input tokens, instead of prose at seconds and dollars. Against agent-based ecology sims, it adopts their UI vocabulary (parameter sliders, live population plot, inspect-one-creature, one-variable comparison, config files) and replaces the hand-coded or evolved brain with a judgment the audience can read.

## 5. Simulation Model and Mechanics

[26] **World.** A fixed rectangular grid chosen in configuration from three presets: Small at 48 by 32 cells, Medium at 80 by 50, Large at 120 by 75. The viewport scales the rendering to fit the screen; the world never changes size with the screen. This replaces the original "max mice from screen size" idea, because a world that follows the viewer's monitor makes runs incomparable across machines. Population caps derive from grid area: one mouse per 25 cells, one food pile per 50, one trap per 100, one cat per 400. On Medium that is 160 mice, 80 food piles, 40 traps, and 10 cats.

[27] **Tick clock.** One tick is one unit of simulated time across the whole world. Every activity costs a whole number of ticks, and the run ends after the configured tick count.

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

[28] **Nutrition.** Starts at 100 percent. Decays 0.5 points per tick, so an unfed mouse starves in 200 ticks. Eating a food pile restores it to 100 percent. Speed bands at 60 and 30 percent slow the mouse as above, which is what makes hungry mice easier for cats to catch. At zero the mouse dies of starvation.

[29] **Movement and capture.** Eight-neighbor movement. Each tick, an animal that is due to move picks the neighboring cell with the highest weighted signal, with a small random jitter to break ties. A cat that moves into a mouse's cell captures it. Mice and cats share a base speed of one cell per tick, so a healthy mouse fleeing straight away is safe until it is cornered, slowed by hunger, or forced to route around known danger; the cat's pounce and the mouse's hunger are what tip the chase.

[30] **Food and traps.** A food pile feeds one mouse once and is consumed. It respawns after the configured interval at a random empty cell, or never if the interval is zero, which turns the run into a starvation countdown. A live trap emits half of a food pile's food signal. A mouse that enters a trap cell rolls to evade: 50 percent at full nutrition, scaling linearly with nutrition. A failed roll kills the mouse, which stays visible in the trap for 10 ticks; the trap then respawns at a random empty cell at least five cells from any mouse. Cats do not trigger traps and do not eat food piles.

[31] **Perception and memory.** Mice see everything within 6 cells; cats within 8. Food and trap signals are smelled without a range limit but fall off with distance. A trap is only recognized as a trap, rather than as a food smell, by a mouse that can currently see a dead mouse in it or that has a memory sentence about a death at that location. A death within a mouse's perception adds a sentence to its memory. Memory holds the five most recent sentences; each expires after 300 ticks. Two adjacent mice exchange their most recent danger memory, tagged as heard rather than seen.

[32] **Drives.** Survive outranks reproduce, and within survive, feed and avoid danger compete; within reproduce, find an optimal mate and find a safe nest compete. Jev arbitrates all of it except the reflexes. The state Jev receives says things like "very hungry," "a cat is close to the northeast and stalking toward you," "food smell to the west where a mouse died recently," and "bold." Hunger counters fear because Jev weighs them, not because a formula does.

[33] **Reproduction.** A mouse may mate after its 30-tick juvenile period. A mouse whose drive lands on seek mate asks Jev to pick among visible eligible candidates, described in words by personality, condition, and distance, and approaches the winner. Mating occurs when the two are adjacent and the other mouse is not fleeing or eating; both stand still for 5 ticks. The female gestates for 60 ticks, then her nest drive activates: Jev scores her current location as a nest site, and she gives birth after standing still for 5 ticks at a spot Jev rates at least "reasonably safe," or anywhere once 20 ticks have passed beyond gestation. A litter is 2 to 4 pups, each at 60 percent nutrition, sex assigned evenly at random, personality drawn from the configured percentages. Pups are full agents from birth. Births that would exceed the mouse cap for the grid are lost; the telemetry records them as cap-limited.

[34] **Cats.** A cat prowls until a mouse is in perception, then asks Jev for a target and a mode. Stalking closes distance at one cell per tick; pounce covers two cells once, then cools down for 20 ticks. A cat that has not closed on its target within 30 ticks drops it, and a cat whose target is lost rests for 10 ticks before prowling again. After a capture the cat eats for 10 ticks, stationary and visible, then hunts again. Cats never starve or die in this version; they are constant pressure.

[35] **Fear learning.** There is no fear counter. A mouse that saw a trap death carries the sentence, and Jev's approach-suspect-food judgment and fear Score respond to it. A mouse that saw a cat eating carries that sentence and flees earlier. Telemetry records mean fear Score across the population over time so the learning is observable.

## 6. Configuration and Personality Mix

[36] **Run knobs.** Grid preset; tick count (default 2,000); random seed; male mice; female mice; cats; traps; food piles; food respawn interval; nutrition decay rate; personality percentages; Jev on or off (baseline mode). Defaults for Medium: 30 male, 30 female, 4 cats, 8 traps, 20 food piles, respawn 40, decay 0.5.

[37] **Personality catalog.** Four types in this version, each a description Jev reads verbatim. Bold: approaches food despite nearby danger, explores far, slow to flee. Cautious: flees early, avoids any remembered danger, forages near where it has eaten before. Vigilant: notices danger sooner (perception 8 instead of 6), shares alarms readily. Social: seeks out other mice, exchanges memories at two cells instead of one, seeks a mate as soon as eligible.

[38] **Percentages.** The user sets a percentage for each type; the four must sum to 100. Every mouse spawned at the start and every pup born during the run draws its personality from those percentages. Offspring do not inherit from parents in this version; an inherit-from-parents toggle is listed under Additional Development because it would turn the simulation into a selection experiment, which is a different product promise.

[39] **Baseline mode.** With Jev off, every decision falls to the code-only reflex and utility rules with fixed weights. Same seed, same config, same engine. This is the control group for the showcase argument and the fallback when the TypeSafe API is unavailable.

[40] **Export and import.** A run's full configuration and seed export as one JSON file and import back. Two people with the file get the same world.

## 7. Telemetry and Analysis

[41] **Everything is an event.** The engine emits a typed event for every state change: tick advanced, animal moved, decision requested and returned (with the exact state object, questions, probabilities, confidence, chosen weights, and token count), food eaten, food respawned, trap entered, evasion rolled, mouse trapped, trap respawned, cat targeted, cat pounced, capture, cat eating started and ended, mating, gestation started, birth (including cap-limited births), death with a single cause of starvation, trap, or cat, memory added, alarm exchanged, and run ended.

[42] **Run record.** Each run produces one record: the full configuration and seed, the Jev model version that answered (from the response's model field), the event stream, per-tick population counts by sex and personality, and totals for requests, input tokens, cost at the configured price, and wall-clock time. Records live in the browser's IndexedDB and export as JSON.

[43] **Views.** Population over time by sex and personality; deaths by cause over time; mean nutrition and mean fear Score over time; decisions per tick and cumulative cost; a per-animal inspector showing the most recent decision end to end. A comparison view loads two run records, highlights every configuration field that differs, and overlays their population and death charts.

[44] **Replay.** A run record contains every Jev response, so the engine can replay a run deterministically without calling the API. Replay is how two runs are compared and how a researcher reproduces a result. A live re-run with the same seed re-asks Jev, and TypeSafe describes Jev as self-consistent but does not guarantee identical answers, so comparisons are made between records, not between a record and a fresh run.

[45] **Cost meter.** Requests, tokens, and cost are shown live during a run and stored with the record. TypeSafe publishes $0.042 per million input tokens with output tokens free, and describes that rate as an early-access snapshot; the price is a configurable constant.

## 8. Scope

[46] **In scope for this version.** Everything in sections 5 through 7: the fixed-grid world with three presets, the tick clock and the activity costs, nutrition and speed bands, food with configurable respawn, traps with evasion and relocation, perception and sentence memory with social alarm, Jev-arbitrated drives with blended movement and event-driven cadence, Jev-driven cats, four personality types with configured percentages applied at spawn and birth, reproduction with gestation and nest choice, the visible-judgment inspector, full event telemetry with IndexedDB storage and JSON export, run comparison and replay, baseline mode, and config export and import.

[47] **Out of scope.** A game you play: no player-controlled animal. A validated ecology model: no claim of biological realism. An open ecosystem editor: fixed cast, no user-defined species or rules. Cross-run parameter learning: no bandit or optimizer between runs. Multi-user or shared sessions: one person, one browser, one run at a time. Generated text or narration: Jev never writes prose. Also excluded from this version: personality inheritance, a lineage or personality-survival view, terrain and obstacles, cats that starve or die, a server-side telemetry store, and a mobile layout.

[48] **Deferred from the competitive survey.** The personality-survival view from Bibites' lineage views is deferred until inheritance exists, because without inheritance every generation draws from the same percentages and the view would show only the configured mix. The other two survey candidates, baseline mode and config export, are in scope.

## 9. Success Criteria

[49] Each criterion is evaluable as true or false after shipping, on the Medium preset with default knobs unless stated.

[50] A 2,000-tick run completes with no TypeSafe rate-limit error and averages at least 2 ticks per second of wall-clock time.

[51] Clicking any living animal shows the exact state object sent to Jev, every question asked, and the full probability distribution returned for its most recent decision.

[52] Replaying a run record reproduces its event stream exactly, with zero API calls.

[53] Two run records that share a seed and differ in one configuration field load side by side with that field highlighted and their population and death charts overlaid.

[54] A baseline-mode run and a Jev run on the same seed and config load in the comparison view with Jev on or off shown as the only differing field.

[55] Across all mice ever alive in a run with at least 100 births, the share of each personality type is within 5 percentage points of its configured percentage.

[56] For mice with a cat within 3 cells and nutrition at or above 60 percent, at least 80 percent of Jev drive decisions in the run place a combined probability of 0.5 or more on flee and hide. This is the numeric guard against the Brownian-motion failure.

[57] Jev cost for the run is under $0.50 at the published price and is shown live during the run.

[58] Every death in the event stream carries exactly one cause: starvation, trap, or cat.

[59] The TypeSafe API key appears in no browser-delivered asset and no response from the proxy, verified by searching the built bundle and inspecting proxy responses.

## 10. Risks and Assumptions

[60] **Blended probabilities read as behavior, not jitter.** If wrong, the demo undercuts Jev. Mitigations: baseline mode for direct comparison, the flee-or-hide criterion above, a per-decision log that isolates model output from bucketing, blending, and cadence, and tunable jitter.

[61] **Event-driven cadence keeps a 2,000-tick run watchable inside 1,200 requests per minute.** If wrong, runs crawl. Mitigations: batch nearby agents into one request, measure ticks per second and requests per minute at 60 mice, and let the user trade tick rate for population.

[62] **Replay from logged responses makes runs comparable despite Jev not guaranteeing identical answers.** If wrong, changing one knob proves nothing. Mitigation: comparisons are always between stored records; the UI never compares a record to a live re-run.

[63] **Cost stays near $0.20 per 1,000 ticks at 60 mice and about 600 tokens per decision.** If wrong, long runs surprise. Mitigations: live meter, configurable price constant, and a per-run cost total in every record.

[64] **Bucketed words carry enough signal for good tradeoffs.** If wrong, decisions look arbitrary in the inspector. Mitigation: tune bucket boundaries and criteria wording, not the model; TypeSafe's guidance is that the explanation you find yourself giving for a wrong answer is the missing half of the instruction.

[65] **TypeSafe's rate limits change without notice** while the service is in early access. Mitigation: the proxy throttles and backs off client-side, and the engine falls back to baseline rules for any agent whose decision is not answered in time, recording the fallback in telemetry.

[66] **Batching several mice into one request risks context rot.** TypeSafe documents accuracy loss as unrelated detail grows in the state. Mitigation: batch only mice in the same region, who share the same cats and food, and cap a batch at about eight agents.

[67] **Personality percentages are only meaningful at scale.** Small runs will drift from the configured mix by chance. The success criterion applies at 100 or more births.

[68] **The fixed grid replaces the screen-size cap.** This brief takes that position for comparability. If Carson intended the world to fill the screen, the presets can be sized to common viewports instead, at the cost of cross-machine comparability.

[69] **Cats as constant pressure.** With no cat mortality, a high cat count is a guaranteed extinction. That is acceptable for a showcase and is left as a knob the user controls.

## 11. Additional Development

[70] Sections and content a brief at this stage would normally carry that this pass did not cover, and that later phases or a revision should supply:

[71] Business objectives for the showcase: where it is published, what it links to, and what a successful showcase does for TypeSafe or for Carson.

[72] Personas with tasks and per-task success criteria. Deliberately skipped for this version; the four audience descriptions in section 3 stand in.

[73] User flows and wireframes for the configuration screen, the live view, the inspector, and the comparison view. Comes with the design work.

[74] Architecture, data model, event schema, and the proxy's API contract. Comes with the design work.

[75] Non-functional requirements beyond the success criteria: browser support, bundle size, accessibility, offline replay. Comes with the requirements document.

[76] The exact Jev question wording and criteria for each drive, the fear Score levels, mate choice, nest safety, and cat targeting. Comes with the technical specification.

[77] A personality inheritance toggle and the lineage view it would enable.

[78] Terrain and obstacles, which would make hide a spatial behavior rather than a signal-field one.

[79] Licensing for the showcase repository.

[80] Test strategy, including how the flee-or-hide criterion and the personality-mix criterion are computed from telemetry in the test suite.
