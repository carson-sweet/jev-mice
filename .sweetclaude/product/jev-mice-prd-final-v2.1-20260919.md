---
title: jev-mice Product Requirements Document
version: 2.1
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: approved as final by Carson Sweet on 2026-09-19; paragraph numbers removed
previous_file: jev-mice-prd-deprecated-v2.1-20260919.md
---

# jev-mice Product Requirements Document

**Version:** 2.1 (final)

**Date:** 2026-09-19

**Work item:** WI-001

**Companion:** jev-mice Product Brief v1.3. The brief explains why; this document says what must be built. Where they disagree, this document wins and the brief gets revised.

## 1. Executive Summary

jev-mice is a browser simulation of mice, cats, traps, food piles, and mouseholes on a fixed grid, advanced one tick at a time for a configured number of ticks. Each mouse and cat decides what to do by asking Jev, TypeSafe's System One decision model, a small set of typed questions and receiving calibrated probabilities back. Code owns everything with a clear right answer; Jev owns the tradeoffs.

This document specifies the world and its clock, the animals and their mechanics, mouseholes as the colony's shelter and nursery, the exact contract between the engine and Jev, the configuration surface including a personality mix that applies to every mouse spawned or born, a telemetry model that makes every run replayable and any two runs comparable, and the user interface that exposes all of it. It closes with non-functional requirements, six epics, and a record of the questions resolved along the way.

## 2. Problem Statement

Many-agent simulations come in two shapes. Large language model agents are believable but slow, expensive, and opaque. Hand-coded utility agents are fast and legible but have no judgment. Nobody has shown a calibrated decision model driving a population where the tradeoffs belong to the model and the audience can see them.

Three scenarios define what the product must do. A watcher whose colony collapsed by tick 600 under 70 percent bold mice needs two runs that share a seed, differ in one knob, and sit side by side. An evaluator watching a hungry mouse pass a feeding cat needs the exact state sent to Jev and the distribution returned. Carson, seeing a colony jitter like Brownian motion, needs a per-decision log that isolates the model's output from the bucketing, the blend, and the cadence.

## 3. Goals and Success Metrics

Each metric is a pass or fail check on a Medium-preset run with default knobs unless stated. The measurement method is part of the requirement.

| ID | Check | Measured by |
|---|---|---|
| SM-01 | A 2,000-tick run completes with zero rate-limit errors at 2 or more ticks per second average | Run record totals: error count and wall time |
| SM-02 | Clicking any living animal shows the exact state, every question, and the full probability distribution of its latest decision | Manual check against the decision event in the record |
| SM-03 | Replaying a run record reproduces its event stream exactly with zero API calls | Automated: replay and diff event streams; proxy request count is zero |
| SM-04 | Two records sharing a seed and differing in one field load side by side with that field highlighted and charts overlaid | Manual check in the comparison view |
| SM-05 | A baseline run and a Jev run on the same seed compare with Jev on or off as the only highlighted difference | Manual check in the comparison view |
| SM-06 | Over a run with 100 or more births, each personality's share of all mice ever alive is within 5 points of its configured percentage | Automated from per-tick counts and birth events |
| SM-07 | For mice outside a hole with a cat within 3 cells and nutrition at or above 60 percent, at least 80 percent of drive decisions put a combined 0.5 or more on flee plus hide | Automated from decision events |
| SM-08 | Jev cost for the run is under $0.50 at the configured price and is shown live | Run record totals and the live meter |
| SM-09 | Every death event carries exactly one cause: starvation, trap, or cat | Automated schema check on the record |
| SM-10 | The TypeSafe key appears in no browser-delivered asset and no proxy response | Automated: search the built bundle; inspect proxy responses in tests |

## 4. Functional Requirements

One requirement per testable behavior. "Shall" is binding. Values marked default are user-configurable unless the requirement says fixed.

### 4.1 World, clock, and mouseholes

FR-001: The system shall offer three fixed grid presets: Small at 48 by 32 cells, Medium at 80 by 50, Large at 120 by 75. World dimensions shall never depend on the viewport.

FR-002: The system shall render the grid scaled to fit the available viewport while leaving world dimensions unchanged.

FR-003: The system shall derive population caps from grid area: mice at most floor(cells / 25), food piles and mouseholes each at most floor(cells / 50), traps at most floor(cells / 100), cats at most floor(cells / 400). A configuration exceeding a cap shall be rejected with the cap displayed.

FR-004: The system shall advance the world in discrete ticks. Every activity shall cost a whole number of ticks as listed in the activity table in section 4.12.

FR-005: The system shall run for the configured tick count, then stop and emit a run-ended event.

FR-006: The system shall support pause, resume, single-tick step, and a target ticks-per-second speed control. None of these shall alter simulation outcomes.

FR-007: All random outcomes in the engine shall derive from one pseudorandom generator initialized from the run seed, so that identical seed, configuration, and Jev responses produce identical engine outcomes.

FR-008: A cell shall hold at most one animal, except that a mousehole cell holds its occupants as described in FR-010. Food piles, traps, and mouseholes occupy cells; animals may enter food and trap cells freely and mousehole cells only as described in FR-020 and FR-047.

FR-009: Mouseholes shall be placed at random empty cells at run start, in the configured count, and shall not move for the duration of the run. Food piles and traps shall never spawn on a mousehole cell. Cats shall never enter a mousehole cell.

FR-010: A mousehole shall hold either one adult mouse or one brood of pups, never both and never more than one adult. A hole is available when it holds neither.

FR-011: The engine shall maintain a shelter signal emitted by available mouseholes and falling off with distance, so that mice know where free shelter is without a range limit, in the same way they smell food.

### 4.2 Mice

FR-012: Each mouse shall have: sex (male or female), personality type, nutrition from 0 to 100, age in ticks, position, a memory list, a current intent, a pregnancy state, and whether it is inside a mousehole.

FR-013: Nutrition shall decay by the configured rate per tick, default 0.5, inside or outside a hole. At zero the mouse shall die with cause starvation.

FR-014: Movement cost shall depend on nutrition: 1 tick per cell at 60 or above, 2 ticks per cell from 30 to 59, 3 ticks per cell below 30.

FR-015: A mouse due to move shall choose among its eight neighboring cells the one with the highest weighted signal sum plus a small seeded jitter, skipping cells occupied by another animal, never voluntarily entering a cell occupied by a cat, and entering a mousehole cell only when its intent is hide or nest and the hole is available.

FR-016: Reflexes shall preempt any current intent without a Jev decision: a cat in an adjacent cell sets the intent to flee; standing on a food pile with nutrition below 100 sets the intent to eat. Reflexes do not apply to a mouse inside a hole.

FR-017: Eating shall hold the mouse stationary for 3 ticks, then set nutrition to 100 and consume the pile. Eating interrupted by the flee reflex shall not consume the pile.

FR-018: A mouse shall execute its current intent until an interrupt event occurs or the intent hold expires, then request a new decision. The hold is 12 ticks, or 6 ticks when the mouse's most recent fear level was panicked.

FR-019: Interrupt events shall be: a cat enters or leaves perception; a food pile is reached; nutrition crosses 60, 30, or 10; a death is witnessed; an alarm is heard; an eligible mate enters perception; gestation completes; the hole the mouse is heading for becomes occupied; the current intent's target no longer exists.

FR-020: A mouse whose intent is hide shall move along the shelter signal to the nearest available hole and enter it. Inside a hole the mouse shall not be capturable or targetable by cats, shall continue to perceive and to receive alarms, shall not move, and shall make no drive decisions. It shall leave the hole when its nutrition drops below 60, and for no other reason in this version. On leaving it shall request a decision.

FR-021: The intent label recorded for a decision shall be the highest-probability drive, matching the choice field Jev returns. When Jev's confidence for the drive question is below 0.5 the decision shall be flagged low-confidence, and the flag shall be visible wherever the label is shown.

### 4.3 Cats

FR-022: Each cat shall have: position, mode (prowl, stalk, pounce, rest, eating), current target, pounce cooldown, a patience counter, and the location where it last saw a mouse.

FR-023: A cat shall move one cell per tick. In prowl mode with no remembered sighting it shall follow a seeded random walk with directional momentum. After losing or dropping a target it shall prowl toward its last sighting for up to 30 ticks, then revert to the random walk.

FR-024: When one or more mice outside holes are within perception, a prowling or resting cat shall request a Jev decision for target and mode, and shall request a new decision when its target is lost, caught, or dropped.

FR-025: In stalk mode the cat shall move one cell per tick toward its target.

FR-026: Pounce shall move the cat two cells toward its target in one tick, shall be available only when the target is within 3 cells and the cooldown is zero, and shall set a 20-tick cooldown.

FR-027: A cat entering the cell of a mouse outside a hole shall capture it. The mouse shall die with cause cat. The cat shall enter eating mode, stationary and visible, for 10 ticks, then return to prowl.

FR-028: A cat whose distance to its target has not decreased over 30 consecutive ticks shall drop the target. A cat whose target leaves perception shall record the last sighting, enter rest for 10 ticks, then prowl.

FR-029: A cat whose target enters a mousehole shall treat the target as lost per FR-028.

FR-030: Cats shall not trigger traps, shall not consume food piles, and shall not die.

### 4.4 Food and traps

FR-031: A food pile shall feed one mouse once and be consumed when eating completes.

FR-032: A consumed food pile shall respawn after the configured interval, default 40 ticks, at a random empty cell that is not a mousehole. An interval of zero shall mean never.

FR-033: A live trap shall emit half the food signal of a food pile.

FR-034: When a mouse enters a trap cell it shall roll to evade with probability 0.5 times nutrition divided by 100. On success the mouse shall continue and gain a memory sentence recording a narrow escape at that location. On failure the mouse shall die with cause trap and remain visible in the trap.

FR-035: A trap holding a dead mouse shall respawn 10 ticks after the death at a random empty cell that is not a mousehole and is at least 5 cells from any living mouse. The previous cell shall become empty.

FR-036: A mouse shall perceive a trap as a food source unless it can currently see a dead mouse in that trap or holds a memory sentence about a death or narrow escape at that location, in which case it shall perceive it as a known trap.

### 4.5 Perception, memory, and fear

FR-037: Perception radius, measured as the larger of the horizontal and vertical distance, shall be 6 cells for mice, 8 for vigilant mice, and 8 for cats.

FR-038: The engine shall maintain four signal fields per mouse: food (piles plus half-weight traps not known to it), danger (cats within perception and known traps), mate (eligible opposite-sex mice within perception), and shelter (available mouseholes per FR-011).

FR-039: A death within a mouse's perception shall add a memory sentence to that mouse stating the kind of event (trap death, cat kill, narrow escape), its bearing, and a relative time bucket, whether the mouse is inside or outside a hole.

FR-040: Memory shall hold at most 5 sentences, dropping the oldest, and each sentence shall expire 300 ticks after it was added.

FR-041: Two mice within alarm range (1 cell, or 2 cells for social mice) shall exchange their most recent seen danger memory once per encounter, and the received sentence shall be tagged as heard rather than seen.

FR-042: A heard memory shall never be passed on. Only memories tagged seen are exchanged under FR-041.

FR-043: The fear level recorded for a decision shall be the highest-probability level of the fear Score. It shall scale the reach of the danger field around cats and known traps by a fixed multiplier: unconcerned 0.5, wary 1.0, alarmed 1.5, panicked 2.0. Panicked shall also shorten the intent hold per FR-018. Fear shall not change the drive weights themselves.

### 4.6 Reproduction and personality

FR-044: A mouse shall be eligible to mate when its age is 30 ticks or more, it is not pregnant, it is outside a hole, and its intent is not eat or flee.

FR-045: A mouse whose drive decision is seek mate shall approach the candidate Jev selected.

FR-046: Mating shall occur when the seeking mouse is adjacent to its chosen candidate, the candidate's intent is not eat or flee, and an available mousehole lies within 3 cells of the pair. Both shall remain stationary for 5 ticks. The female shall become pregnant.

FR-047: Gestation shall last 60 ticks. Afterward the female's nest drive becomes available and, when chosen, moves her along the shelter signal to the nearest available hole. On arrival Jev's nest-site Score rates that hole's surroundings; at reasonably safe or better she shall give birth into the hole after 5 stationary ticks adjacent to it. With no available hole there is no birth; the nest drive persists and is arbitrated by Jev against eat and flee like any other drive, so survival still outranks it.

FR-048: A litter shall contain 2 to 4 pups born into the hole as one brood, each with nutrition 75, age 0, empty memory, sex assigned evenly at random, and personality drawn from the configured percentages. The mother shall remain outside the hole.

FR-049: A pup shall leave the hole when its nutrition drops below 60 and shall be a full agent from that moment. The hole shall become available when the last pup leaves. While inside, pups follow FR-020.

FR-050: A birth that would exceed the mouse cap shall not create the pup and shall emit a cap-limited birth event.

FR-051: The system shall provide four personality types: bold, cautious, vigilant, social. Each shall have a text description included verbatim in the mouse's Jev state. Vigilant shall also set perception to 8 cells; social shall also set alarm range to 2 cells.

FR-052: The configured personality percentages shall sum to 100. Every mouse created at spawn and every pup created at birth shall draw its personality from those percentages using the run's seeded generator.

### 4.7 Configuration

FR-053: The configuration screen shall expose: grid preset; tick count (default 2,000, range 100 to 20,000); seed (random by default, editable); male mice; female mice; cats; traps; food piles; mouseholes; food respawn interval; nutrition decay rate; the four personality percentages; Jev on or off; price per million input tokens (default 0.042).

FR-054: The system shall validate every field against its range, the grid caps, and the percentage sum, and shall show errors inline before a run can start.

FR-055: Medium preset defaults shall be 30 male, 30 female, 4 cats, 8 traps, 20 food piles, 12 mouseholes, respawn 40, decay 0.5, personalities 25 percent each.

FR-056: The system shall export the full configuration and seed as one JSON file and import such a file, validating it as in FR-054.

### 4.8 Telemetry and replay

FR-057: The engine shall emit a typed event for every state change, each carrying the tick and a monotonically increasing sequence number. Event types shall include at least: tick advanced, animal moved, decision requested, decision returned, decision fallback, food eaten, food respawned, trap entered, evasion rolled, mouse trapped, trap respawned, hole entered, hole left, brood born, hole freed, cat targeted, cat pounced, capture, cat eating started, cat eating ended, mating, gestation started, birth, cap-limited birth, death, memory added, alarm exchanged, run started, run ended.

FR-058: Each decision-returned event shall contain the complete request state object, every question with its options or levels, every probability and confidence returned, the intent label and low-confidence flag per FR-021, the fear level per FR-043, the model identifier from the response, the input token count, and the derived signal weights.

FR-059: Every death event shall carry exactly one cause from the set starvation, trap, cat.

FR-060: A run record shall contain: the full configuration and seed, the engine version, the Jev model identifier, the complete event stream, per-tick counts of mice by sex, by personality, and by inside-or-outside a hole, and totals for requests, input tokens, cost at the configured price, fallbacks, and wall-clock time.

FR-061: Run records shall be stored in the browser's IndexedDB. The system shall list, open, rename, and delete records, and shall export any record as JSON and import a JSON record.

FR-062: The system shall replay any run record by re-rendering from its events without any network request, and shall let the user scrub to any tick.

FR-063: The comparison view shall load two run records, highlight every configuration field that differs, and overlay their population-over-time and deaths-by-cause charts.

### 4.9 User interface

FR-064: The live view shall render the grid on a canvas with visually distinct marks for male and female mice by personality, cats by mode, traps (live and occupied), food piles, and mouseholes by occupancy (empty, adult, brood), using shape as well as color, and shall indicate each mouse's nutrition band.

FR-065: Clicking an animal shall open an inspector showing its identity, sex, personality, nutrition, age, whether it is in a hole, memory sentences with their seen or heard tag, current intent with any low-confidence flag, and its latest decision end to end: the state sent, each question, the probabilities and confidence returned, the fear level, the derived weights, the resulting move, and that decision's token count and cost.

FR-066: The live view shall show charts updated as the run proceeds: population by sex and personality, mice in holes, deaths by cause, mean nutrition, mean fear level, decisions per tick, and cumulative cost.

FR-067: The live view shall show a meter with current tick, ticks per second, requests, input tokens, and cost.

FR-068: Run controls shall include start, pause, step, speed, reset with the same seed, and new seed.

### 4.10 Baseline mode and fallback

FR-069: With Jev off, every decision shall be made by documented fixed-weight rules over the same signal fields, at the same interrupt cadence, so that only the decision source differs between a baseline run and a Jev run.

FR-070: If a Jev decision is not answered within 2,000 milliseconds or returns an error, the affected agent shall use the baseline rules for that decision and the engine shall emit a decision-fallback event.

FR-071: The run record shall state whether Jev was enabled and shall count fallbacks.

### 4.11 Proxy and batching

FR-072: The browser shall never hold the TypeSafe key. All Jev requests shall go to a same-origin proxy endpoint that adds the key and forwards to TypeSafe.

FR-073: The proxy shall rate-limit outbound requests below TypeSafe's published limit with a configurable ceiling, shall honor retry-after on 429 responses, and shall return usage and model fields unchanged.

FR-074: The engine shall divide the grid into fixed 16-by-16-cell tiles and group up to 8 decision-ready mice from the same tile on the same tick into one Jev request, spilling further mice into additional requests. Each mouse's state shall sit under its own key and each question shall reference that key. Cats shall never be batched with mice.

### 4.12 Activity cost table

| Activity | Ticks |
|---|---|
| Mouse move, one cell, nutrition 60 or above | 1 |
| Mouse move, one cell, nutrition 30 to 59 | 2 |
| Mouse move, one cell, nutrition below 30 | 3 |
| Cat move, one cell | 1 |
| Cat pounce, two cells | 1, then 20 cooldown |
| Mouse eats a food pile | 3 |
| Cat eats a caught mouse | 10 |
| Dead mouse occupies a trap before respawn | 10 |
| Mating | 5 |
| Gestation | 60 |
| Birth | 5 |
| Pups in the hole before hunger drives them out (derived: 75 to 60 at decay 0.5) | about 30 |
| Juvenile period | 30 |
| Cat rest after losing a target | 10 |
| Cat patience before dropping a target | 30 |
| Cat returns toward last sighting before random prowl | up to 30 |
| Food respawn (default) | 40 |
| Memory sentence lifetime | 300 |
| Maximum intent hold before re-deciding | 12, or 6 when panicked |

## 5. Jev Decision Contract

This section fixes what is asked, when, with what options, and what code does with the answer. Exact instruction and criteria wording is left to the technical specification, subject to the rules below.

**State rules.** Every value sent to Jev is a word or short phrase, never a number, coordinate, or percentage. Distances are near, close, or far. Bearings are compass words. Nutrition is full, fed, hungry, very hungry, or starving. Cat state is words such as prowling, stalking toward you, eating. Shelter is described as a free mousehole near, close, or far, or none free. The mouse's personality description and its memory sentences, each marked seen or heard, are included verbatim. Only what is within perception, smell, or memory is sent.

**Mouse decision request.** One request per decision, containing the questions below. Questions marked speculative are always asked when their precondition holds and are read only when the drive answer makes them relevant. Mice inside holes make no requests.

| Question | Type | Asked when | Options or levels | Code consumes it as |
|---|---|---|---|---|
| drive | Choice | Every mouse decision | explore always; eat if any food signal perceived; flee if danger perceived or a danger memory is fresh; hide if an available hole exists; seek mate if eligible and a candidate is visible; nest if pregnant past gestation and an available hole exists | Probabilities become weights on the signal fields: eat on food, flee away from danger, hide and nest on shelter, seek mate on mate, explore on least-visited. The highest option is the intent label; confidence below 0.5 sets the low-confidence flag |
| fear | Score | Every mouse decision | unconcerned, wary, alarmed, panicked | Highest level maps to the danger-field reach multiplier 0.5, 1.0, 1.5, 2.0; panicked halves the intent hold; recorded for the mean-fear chart |
| approach suspect food | Noul | Speculative: nearest food signal is at a location with a death or escape memory | yes or no | Read only when drive is eat: below 0.5 removes that source from the food field for this intent |
| mate choice | Choice | Speculative: eligible and one or more candidates visible | One option per visible candidate, described by personality, condition, and distance, plus none | Read only when drive is seek mate: sets the approach target; none means wait |
| nest site | Score | Speculative: pregnant past gestation and adjacent to an available hole | dangerous, uneasy, reasonably safe, safe | Read only when drive is nest: reasonably safe or better permits birth into this hole |

**Cat decision request.** One request per decision.

| Question | Type | Asked when | Options | Code consumes it as |
|---|---|---|---|---|
| target | Choice | One or more mice outside holes in perception and the cat is prowling or resting, or its target was lost, caught, or dropped | One option per visible mouse, described by apparent speed, isolation, proximity to other mice, distance, and whether it is heading for a hole, plus none worth it | Sets the target; none worth it keeps prowling |
| mode | Choice | Same request as target | prowl, stalk, pounce (only if a target is within 3 cells and cooldown is zero), rest | Sets the mode for the next intent |

**Batching rule.** Up to 8 mice from the same 16-by-16 tile share one request. Each mouse's state sits under its own key, and every question's instruction names that key. Cats are never batched with mice.

**Baseline substitution.** When Jev is off or a decision falls back, the same questions are answered by fixed rules: drive weights from nutrition band, danger presence, and shelter availability; fear from nearest cat distance; approach suspect food as no when a death memory exists; mate choice as nearest candidate; nest site as safe when no cat has been perceived within 100 ticks. The event records which source answered.

## 6. Non-Functional Requirements

NFR-001 Performance: a Medium default run with Jev on shall sustain at least 2 ticks per second; with Jev off, at least 30 ticks per second.

NFR-002 Rendering: the live view shall hold at least 30 frames per second on the Large preset at its caps on a current laptop.

NFR-003 Cost: a 2,000-tick Medium default run shall cost under $0.50 at the configured price, and the meter shall never lag the true total by more than one request.

NFR-004 Reproducibility: the engine shall be deterministic given seed, configuration, and the sequence of Jev responses; replay from a record shall reproduce the event stream byte for byte.

NFR-005 Security: the TypeSafe key shall exist only in server-side configuration. The built bundle and all proxy responses shall contain no key material.

NFR-006 Data minimization: the system shall collect no personal data and shall include no analytics or tracking. Telemetry describes simulated animals only. This is the baseline data-handling obligation for a public web page and applies regardless of where users are.

NFR-007 Browser support: current desktop releases of Chrome, Firefox, and Safari, with IndexedDB available.

NFR-008 Rate-limit resilience: no run shall abort because of a 429 response; the proxy shall back off and the engine shall fall back per FR-070.

NFR-009 Accessibility baseline: all run controls shall be keyboard operable, and no state shall be conveyed by color alone.

NFR-010 Engine isolation: the engine module shall have no DOM or network dependency and shall run headless under Node for tests and for baseline-only runs.

NFR-011 Storage: a Medium default run record shall export as JSON under 100 megabytes uncompressed and shall load in the comparison view without freezing the page for more than one second.

## 7. Epics and User Story Summary

One epic per group of requirements that can ship and be tested on its own. Story summaries are written for the audience they serve; full stories with acceptance criteria follow in the planning work.

**EP-1 Engine core** (FR-001 to FR-052, FR-069). Headless, deterministic, baseline rules only, including mouseholes. Stories: as Carson I can run a seeded baseline simulation under Node and get an identical event stream every time; as a researcher I can read the mechanics in one place and see each activity's tick cost; as a watcher I can see hungry mice slow down and get caught, and see a brood emerge from a hole about 30 ticks after birth.

**EP-2 Jev decision layer** (FR-016, FR-018 to FR-021, FR-024, FR-043, section 5, FR-070 to FR-074). Stories: as an evaluator I can see the exact words Jev received and the distribution it returned for any mouse; as Carson I can switch a mouse decision between Jev and baseline and see the movement change; as Carson I can run 60 mice without hitting a rate limit; as a watcher I can see which decisions Jev was unsure about.

**EP-3 Configuration and personality mix** (FR-051 to FR-056). Stories: as a watcher I can set 70 percent bold and 30 percent cautious and see the mix hold across births; as a researcher I can export a configuration and seed and hand it to someone else; as a watcher I cannot start a run that exceeds the grid's caps; as a watcher I can starve the colony of shelter by setting few mouseholes and see what happens.

**EP-4 Telemetry, records, replay** (FR-057 to FR-063). Stories: as a researcher I can export a run and replay it with the network disabled; as Carson I can find the decision that made a mouse walk into a trap and see every stage of it; as a watcher I can scrub back to the tick the population started falling.

**EP-5 Live view and inspector** (FR-064 to FR-068). Stories: as a watcher I can tell males from females, bold from cautious, and an empty hole from one holding a brood at a glance; as an evaluator I can click a mouse mid-chase and read its fear level and drive weights; as a watcher I can see cost climbing as the run proceeds.

**EP-6 Charts and comparison** (FR-063, FR-066, SM-04, SM-05). Stories: as a watcher I can load the 70 percent bold run beside the 30 percent bold run and see the differing knob highlighted; as an evaluator I can compare a Jev run to its baseline twin; as a researcher I can read deaths by cause over time for both.

## 8. Out of Scope

A game you play: no player-controlled animal. A validated ecology model: no claim of biological realism. An open ecosystem editor: fixed cast, no user-defined species or rules. Cross-run parameter learning: no bandit or optimizer between runs. Multi-user or shared sessions. Generated text or narration. Also excluded from this version: personality inheritance, a lineage or personality-survival view, terrain and obstacles other than mouseholes, cat mortality, mice leaving a hole for any reason other than hunger, rumor chains beyond one hop, a server-side telemetry store, and a mobile layout.

## 9. Assumptions and Constraints

**Assumptions.** Blended probabilities read as behavior rather than jitter. Event-driven cadence at roughly one decision per agent per 8 ticks keeps a run inside 1,200 requests per minute. Replay from logged responses is the only reproducible comparison, since Jev is self-consistent but not guaranteed identical. Cost stays near $0.20 per 1,000 ticks at 60 mice and about 600 tokens per decision. Bucketed words carry enough signal for good tradeoffs. Batching up to 8 tile-mates per request does not degrade accuracy through context rot. Cats as constant pressure still produce interesting runs at default knobs. Twelve mouseholes for sixty mice produces real contention for shelter without stalling reproduction.

**Constraints.** TypeSafe's published limits: 1,200 requests per minute, 250,000 tokens per second, 64,000 tokens per request with 32,000 for state plus the longest question, text-only input. Published price $0.042 per million input tokens, described as an early-access snapshot. Jev is documented as weak at arithmetic, counting, numeric comparison, and large states full of irrelevant detail, and its Score probabilities are not to be interpolated into magnitudes. The TypeSafe JavaScript SDK is MIT licensed. Storage is browser-local. One user, one browser, one run at a time.

## 10. Open Questions

**Open.** None. The repository is private and carries no license at this time; if it is ever published, a license must be chosen first.

**Resolved in this version, for the record.** Intent label is the top-probability drive with a low-confidence flag under 0.5. Cat prowl is a random walk with momentum plus a return toward the last sighting for up to 30 ticks. Hiding means entering a mousehole; mouseholes also host broods and are required for breeding. Fear scales the danger field's reach by a fixed multiplier per level and panicked halves the intent hold. Heard memories are never retold. Batching regions are fixed 16-by-16 tiles. Pups are safe in the hole from birth at 75 percent nutrition until hunger drives them out below 60, about 30 ticks.

## 11. Additional Development

Full user stories with acceptance criteria for the six epics. User flows and wireframes for the configuration screen, live view, inspector, and comparison view. System architecture, module boundaries, and the proxy's request and response contract. The event schema as a formal type definition. The exact Jev instruction and criteria wording for each question, with the tested bucket boundaries and the shelter descriptions. The baseline rule weights. A test strategy including how SM-06 and SM-07 are computed from a record. An accessibility audit beyond the baseline. Toggles deferred from this version: hole exit for reasons other than hunger, rumor chains with decay, personality inheritance and the lineage view it enables. A mobile layout and a server-side store if the showcase outgrows browser storage.
