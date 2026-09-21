---
title: jev-mice Product Requirements Document
version: 3.7
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: minor. The configuration screen opens on the small world rather than medium, to keep a first run cheap for whoever deployed it: about 15 cents of Jev against 20. The turn count stays at 2,000, because halving it would save more and show nothing -- nothing fails inside 1,000 turns. FR-055b added. Recorded as decision 110. Previous change, carried forward: minor. Request logging permitted, which retains the visitor network address in the clear for seven days. NFR-006 previously allowed only a daily-rotated salted hash of it, so enabling Workers Logs contradicted the requirement the moment it was switched on; this records the change rather than leaving the document stale. Carson asked for the logs after assuming Web Analytics already provided them. Recorded as decision 109. Previous change, carried forward: minor. Toxoplasma gondii added as a configurable contamination rate on food, with FR-146 to FR-152. Modelled from the literature: contamination enters through food because cats are the only oocyst source; infection damps fear generally and permanently; transmission between mice is vertical only; cachexia is the lifespan effect. Cats are given no preference for infected prey, because none is documented -- the prevalence among cat-caught rodents is the result of easier capture, not a cause. Recorded as decision 108. Previous change, carried forward: minor. Aggregate usage measurement permitted, by a cookieless first-party beacon only. Carson asked for Google Analytics to see who is using the public deployment; FR-139 and NFR-006 forbade exactly that, so the narrowest change that answers the question was taken instead. FR-139 now distinguishes counting visits from tracking people, and NFR-006 permits one named cookieless beacon while still forbidding cross-site tracking, fingerprinting and any script that can identify a person. Recorded as decision 107. Previous change, carried forward: minor. Per-preset starting conditions replace the single specified set, each chosen from a measured survival sweep so a default colony survives about thirteen of sixteen seeds instead of dying on all of them; nutrition decay default 0.5 to 0.3 and food respawn default 40 to 60 follow from that. Closes decision 63, which had stood open since the specified medium defaults were measured driving every seed extinct. Adds FR-142 to FR-145 for the survival figure the configuration screen now shows, and states that survival depends on run length as well as settings. Recorded as decision 102. Previous change, carried forward: cat mortality removed from Out of Scope, since cats now starve by decision 85 and a dead world ends a run by decision 86; leaving the exclusion in place contradicted the build. SM-07 scoped to runs decided by Jev, with the fixed rules reporting their rate as the comparison rather than being held to the threshold. Carson decided this on 2026-09-20 after the measure was wired up and showed the rules at about 36 percent against a threshold of 80; the cause is structural rather than a defect. Recorded as decision 101. Nothing else changed.
previous_file: jev-mice-prd-deprecated-v3.6-20260921.md
---

# jev-mice Product Requirements Document

**Version:** 3.7 (final)

**Date:** 2026-09-20

**Work item:** WI-001

**Companion:** jev-mice Product Brief v2.0. The brief explains why; this document says what must be built.

**What changed and why.** Version 2.1 described a single-user application that simulated in the browser and stored records locally. The product is now a hosted service: people sign in with Google, the simulation runs on the server one process per run, records live in shared storage, runs can be shared by link, and an operator can open the deployment to anonymous visitors. Section 13 lists every requirement that changed. Requirement numbers are permanent: a requirement that no longer applies is marked withdrawn and its number is never reused.

**Design documents that are now upstream of this one.** Architecture v2.1, User flows v1.0, Data model v1.0, API design v1.0, and Technical specification v1.0 are all final and describe the system this document specifies. Where a requirement here and a design document disagree, that is a defect in one of them and worth raising.

## 1. Executive Summary

jev-mice is a hosted web application in which mice, cats, traps, food piles, and mouseholes interact on a fixed grid for a configured number of ticks, with every animal's decisions arbitrated by Jev, TypeSafe's System One model. A person configures a run; the server simulates it in a dedicated process, streaming frames to whoever is watching and writing the record to storage as it goes; the browser draws.

People sign in with Google and keep a library of runs that follows them across devices. Any run can be shared by link with someone who has no account. Two runs can be compared side by side, and any completed run can be replayed tick by tick with the full record of what Jev was asked and what it answered. An operator can switch authentication off, in which case anonymous visitors can run simulations under tighter limits.

This document specifies the simulation and its mechanics, the contract between the engine and Jev, the hosted service around it, and what finished looks like. It closes with eighteen measurable checks, sixteen non-functional requirements, and ten epics.

## 2. Problem Statement

Many-agent simulations come in two shapes. Large language model agents are believable but slow, expensive, and opaque. Hand-coded utility agents are fast and legible but have no judgment. Nobody has shown a calibrated decision model driving a population where the tradeoffs belong to the model and the audience can see them.

Three scenarios define what the product must do. A watcher whose colony collapsed by tick 600 under 70 percent bold mice needs two runs that share a seed, differ in one setting, and sit side by side. An evaluator watching a hungry mouse pass a feeding cat needs the exact state sent to Jev and the distribution returned. Carson, seeing a colony jitter like Brownian motion, needs a per-decision log that isolates the model's output from the bucketing, the blend, and the cadence.

Hosting the product adds a fourth demand that the first version did not have. A run of twenty thousand ticks takes long enough that nobody will sit and watch it, and a browser tab is the wrong place to keep it alive. A run must survive the tab that started it, the network dropping, and the process that runs it failing.

## 3. Goals and Success Metrics

Each check is pass or fail on a Medium-preset run with default settings unless stated. The measurement method is part of the requirement.

| ID | Check | Measured by |
|---|---|---|
| SM-01 | A 2,000-tick run alone in the deployment completes with zero rate-limit refusals at 2 or more ticks per second, measured over active simulation time | Run totals: rate-limit refusal count, other error count, and active simulation time, all recorded fields |
| SM-02 | Clicking any living animal shows the exact state, every question, and the full probability distribution of its latest decision | Manual check against the decision event in the record |
| SM-03 | Replaying a stored run reproduces its event stream exactly, excluding the named wall-clock fields, with no decision calls | Automated: replay and diff streams with latency and timing fields excluded by a declared list; decision-call count is zero |
| SM-04 | Two runs sharing a seed and differing in one setting load side by side with that setting highlighted and charts overlaid | Manual check in the comparison view |
| SM-05 | A code-only run and a decision-model run on the same seed compare with the decision source as the only highlighted difference | Manual check in the comparison view; the decision source is part of what the view diffs |
| SM-06 | Over a run reaching 1,000 or more mice ever alive, each personality's share is within 5 points of its configured percentage | Automated from spawn and birth events, both recorded. Below 1,000 the observed deviation is reported without a verdict, because a 5-point band at smaller samples is inside the noise |
| SM-07 | For a run decided by Jev: of mice outside a hole with a cat very close and nutrition at or above 60 percent, at least 80 percent of drive decisions put a combined 0.5 or more on flee plus hide | Automated from decision events, streamed chunk by chunk, with a minimum of 100 qualifying decisions before a verdict. Mice with a cat adjacent are excluded because a reflex preempts their decision and they produce no decision event. Scoped to Jev by decision 101: the measure exists to say whether judgment looks intelligent, so the fixed rules are the comparison and are not held to the threshold. A run on the rules reports its rate without a verdict, which is the comparison the Jev figure is read against |
| SM-08 | Jev cost for the run is under $0.50 at the configured price and is shown live | Run totals and the live meter |
| SM-09 | Every death event carries exactly one cause: starvation, trap, or cat | Automated schema check on the record |
| SM-10 | No secret appears in any browser-delivered asset or any API response | Automated: the build scans the bundle for key patterns and fails on a hit; a test asserts no response body or header on any route matches those patterns |
| SM-11 | A run continues to completion after the tab that started it is closed, and reopening the library shows it finished | Manual: start, close, return |
| SM-12 | A run whose simulation process is killed mid-run resumes from its last chunk boundary and completes with an unbroken event stream | Automated: kill the process, assert the stream has no gap and no repeat |
| SM-13 | No route returns another person's run, record, or account data | Automated: the authorization matrix tested cell by cell |
| SM-14 | Deleting an account removes every run, chunk, summary segment, share link, usage row, coordinator state and stored object belonging to it, and invalidates its sessions on every device | Automated: create, populate, sign in twice, delete, then assert nothing remains in any of the four stores and that the second session no longer authenticates |
| SM-15 | A run whose budget is exhausted mid-run continues on baseline rules with a visible banner and does not fail | Automated: set a tiny budget, assert completion and a fallback event |
| SM-16 | An anonymous run and everything about it, including its usage records, is gone within 24 hours of its expiry | Automated: create, advance the clock past expiry plus the sweep interval, run the sweep, assert nothing remains in any store |
| SM-17 | A viewer joining a running simulation sees the current state within 2 seconds, and a dropped connection recovers without a page reload | Manual and automated reconnect test |
| SM-18 | A share link opens the run for someone with no account, and stops working the moment it is revoked | Automated |

## 4. Functional Requirements

One requirement per testable behavior. "Shall" is binding. Values marked default are configurable unless the requirement says fixed. Requirements FR-001 to FR-052 describe the simulation and are unchanged from the previous version.

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

FR-013: Nutrition shall decay by the configured rate per tick, default 0.3, inside or outside a hole. At zero the mouse shall die with cause starvation.

FR-014: Movement cost shall depend on nutrition: 1 tick per cell at 60 or above, 2 ticks per cell from 30 to 59, 3 ticks per cell below 30.

FR-015: A mouse due to move shall choose among its current cell and its eight neighboring cells the one with the highest weighted signal sum plus a small seeded jitter, skipping cells occupied by another animal, never voluntarily entering a cell occupied by a cat, and entering a mousehole cell only when its intent is hide or nest and the hole is available.

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

FR-032: A consumed food pile shall respawn after the configured interval, default 60 ticks, at a random empty cell that is not a mousehole. An interval of zero shall mean never.

FR-033: A live trap shall emit half the food signal of a food pile.

FR-034: When a mouse enters a trap cell it shall roll to evade with probability 0.5 times nutrition divided by 100. On success the mouse shall continue and gain a memory sentence recording a narrow escape at that location. On failure the mouse shall die with cause trap and remain visible in the trap.

FR-035: A trap holding a dead mouse shall respawn 10 ticks after the death at a random empty cell that is not a mousehole and is at least 5 cells from any living mouse. The previous cell shall become empty.

FR-036: A mouse shall perceive a trap as a food source unless it can currently see a dead mouse in that trap or holds a memory sentence about a death or narrow escape at that location, in which case it shall perceive it as a known trap.

### 4.5 Perception, memory, and fear

FR-037: Perception radius, measured as the larger of the horizontal and vertical distance, shall be 6 cells for mice, 8 for vigilant mice, and 8 for cats.

FR-038: The engine shall maintain four signal fields per mouse: food (piles plus half-weight traps not known to it), danger (cats within perception and known traps), mate (eligible opposite-sex mice within perception), and shelter (available mouseholes per FR-011). A fifth term, exploration, shall favour cells continuing the mouse's recent direction of travel rather than a record of where it has been.

FR-039: A death within a mouse's perception shall add a memory sentence to that mouse stating the kind of event (trap death, cat kill, narrow escape), its bearing, and a relative time bucket, whether the mouse is inside or outside a hole.

FR-040: Memory shall hold at most 5 sentences, dropping the oldest, and each sentence shall expire 300 ticks after it was added.

FR-041: Two mice within alarm range (1 cell, or 2 cells for social mice) shall exchange their most recent seen danger memory once per encounter, and the received sentence shall be tagged as heard rather than seen.

FR-042: A heard memory shall never be passed on. Only memories tagged seen are exchanged under FR-041.

FR-043: The fear level recorded for a decision shall be the highest-probability level of the fear Score. It shall scale the distance over which danger is felt around cats and known traps by a fixed factor: unconcerned 0.5, wary 1.0, alarmed 1.5, panicked 2.0. The factor shall change the shape of the danger gradient across the candidate cells, not only its magnitude, because the fields are normalized across those cells before weighting and a magnitude scale would have no effect at all. Panicked shall also shorten the intent hold per FR-018. Fear shall not change the drive weights themselves.

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

FR-053: The configuration screen shall expose: grid preset; tick count (default 2,000, range 100 to 20,000); seed (random by default, editable, lockable); male mice; female mice; cats; traps; food piles; mouseholes; food respawn interval; nutrition decay rate; the four personality percentages; Jev on or off.

FR-054: The system shall validate every field against its range, the grid caps, and the percentage sum, and shall show errors beside the field before a run can start.

FR-055: Each preset shall have its own starting conditions, every one of them a configuration whose survival has been measured. All three shall use decay 0.3, respawn 60, and personalities 25 percent each, with the rest as follows.

| Preset | Male | Female | Cats | Traps | Food piles | Mouseholes |
|---|---|---|---|---|---|---|
| Small | 15 | 15 | 1 | 4 | 20 | 16 |
| Medium | 30 | 30 | 3 | 8 | 60 | 24 |
| Large | 30 | 30 | 4 | 8 | 80 | 32 |

FR-055b: The configuration screen shall open on the small world. A first run is paid for by whoever deployed the system, and small costs about three quarters of what medium costs in decisions. Every preset remains one click away, and the success measures of section 3 are still taken on a medium run.

FR-055c: The default turn count shall not be reduced below 2,000 to save cost. Nothing fails inside 1,000 turns: every configuration measured survives 800 and they only separate after 1,800, so a shorter default would show a population climbing to its cap and nothing else, and the outcome the survival table of FR-142 exists to characterise would be unreachable without changing a setting.

FR-055a: Each preset's defaults shall survive between 60 and 95 percent of measured seeds at the default tick count, and shall not fall below 55 percent at the longest measured run. A default that always survives and a default that usually dies are both defects. One preset may not be given another's numbers: the same settings that sustain a colony on the medium map do not sustain one on the small map, because shelter and food scale with area while a cat's reach does not.

FR-142: The configuration screen shall show, before a run starts, how often the current settings were measured to leave living mice at the end of the run. The figure shall be presented as a count of measured runs rather than a percentage, so the sample size it rests on is visible.

FR-143: The figure shall be read from a stored table of measured outcomes, never computed on demand. A single simulation takes seconds and an honest figure needs dozens, so the table shall be produced by a sweep run separately from the application.

FR-144: The figure shall depend on the configured tick count as well as the other settings, and shall change when the tick count changes. Extinction is late: configurations that are indistinguishable at 800 ticks separate after 1,800. The system shall decline to show a figure for a tick count beyond the sweep's own horizon rather than extrapolating.

FR-145: Where the current settings are not a combination the sweep measured, the system shall say so and name the nearest measured combination. Where the settings depart from a value the sweep held fixed, the system shall name that value. The system shall decline to show a figure at all for a cat count outside the measured range, because the boundary in that dimension is sharp enough that interpolation across it would report a number no run produced.

### 4.7a Toxoplasmosis

The mechanics below follow the published biology. Each requirement names what it rests on, because the obvious guess is wrong in one place and the model should not quietly drift back towards it.

FR-146: The configuration shall expose a toxoplasmosis rate, 0 to 100 percent, default 0. It shall be the chance that a food pile is contaminated when it first appears and again each time it respawns. Food is the route because cats are the only source of oocysts and those oocysts survive in soil and water for months to years; a mouse meets the parasite by eating contaminated material, not by meeting another mouse.

FR-147: A mouse that eats a contaminated pile shall become infected, permanently. There shall be no recovery, because the behavioural change is documented to persist after the parasite itself is cleared.

FR-148: An infected mouse shall be one step less fearful than it would otherwise be, across the whole fear scale, never below the lowest level. The damping shall be general rather than specific to cats, following the finding that the parasite reduces anxiety and predator aversion broadly. It shall be applied to whatever the decider answered, so that a Jev run and a rules run are affected identically and neither decider is told the animal is ill.

FR-149: An infected mouse shall burn nutrition faster than an uninfected one, modelling the chronic cachexia of roughly a fifth of body mass with no recovery. There shall be no scripted death from infection: the shorter life shall follow from starving sooner and from spending more of it hungry, and therefore slower.

FR-150: A cat shall have no preference whatsoever for infected prey, and nothing about infection shall reach a cat's decision. No predator-side appetite is documented. The high infection prevalence among cat-caught rodents is a consequence of infected prey being easier to catch, and the system shall reproduce it as a consequence rather than assume it as a cause.

FR-151: An infected mouse's pups shall be infected at birth with a probability in the range the literature reports for congenital transmission in mice. This shall be the only route between mice: no horizontal transmission is documented without a cat, and the system shall implement none.

FR-152: A cat that eats an infected mouse shall begin shedding, permanently, and shedding cats shall raise the chance that a respawning pile is contaminated above the configured rate. The configured rate is therefore a floor rather than the whole story. Shedding shall change nothing about how a cat hunts.

FR-152a: At a rate of zero the engine shall not draw from the seeded stream for contamination at all, so that a run with the parasite switched off is byte-identical to the same seed before the parasite existed. The survival table of FR-142 was measured without it.

FR-056: The system shall export the full configuration and seed as one file and import such a file, validating it as in FR-054.

FR-140: The configuration screen shall show, before a run starts, the expected number of decisions, tokens, cost and duration, each labelled as an estimate. Estimates shall be derived from recorded totals of recent completed runs, and the system shall record each run's decision count, token count and active simulation time for that purpose.

### 4.8 Telemetry and records

FR-057: The engine shall emit a typed event for every state change, each carrying the tick and a monotonically increasing sequence number. Event kinds shall include at least: run started, mouse spawned, run resumed, tick advanced, moved, decision requested, decision returned, decision fallback, food eaten, food respawned, trap entered, evasion rolled, mouse trapped, trap respawned, hole entered, hole left, brood born, hole freed, cat targeted, cat pounced, capture, cat eating started, cat eating ended, mating, gestation started, birth, cap-limited birth, death, memory added, alarm exchanged, and run ended.

FR-058: Each decision-returned event shall contain the complete state sent, every question with its options or levels, every probability and confidence returned, the intent label with its low-confidence flag, the fear level, the model identifier, the input token count, and the derived signal weights.

FR-059: Every death event shall carry exactly one cause from the set starvation, trap, cat.

FR-060: A run's record shall consist of its configuration, seed, engine version, model identifier, the ordered sequence of chunks covering every tick, one summary segment per chunk, and the totals for requests, tokens, cost, fallbacks, rate-limit refusals, other errors, and active simulation time excluding time paused or queued.

FR-061: *Withdrawn in version 3.0.* Previously required run records to be stored in the browser's local database. Records are now stored by the service; see FR-098 to FR-104.

FR-062: The system shall replay any stored run from its chunks, allow scrubbing to any tick, and make no decision call while doing so.

FR-063: The comparison view shall load two runs, highlight every configuration field that differs, and overlay their population and deaths-by-cause series.

### 4.9 Viewer

FR-064: The live view shall render the grid with visually distinct marks for male and female mice by personality, cats by mode, traps live and occupied, food piles, and mouseholes by occupancy, using shape as well as color, and shall show each mouse's nutrition band.

FR-065: Clicking an animal shall open an inspector showing its identity, sex, personality, nutrition, age, whether it is sheltering, its memory sentences with their seen or heard provenance, its current intent with any low-confidence flag, and its latest decision end to end: the state sent, each question, the probabilities and confidence returned, the fear level, the derived weights, the resulting move, and that decision's tokens and cost.

FR-066: The live view shall show charts updated as the run proceeds: population by sex and personality, mice sheltering, deaths by cause, mean nutrition, mean fear, decisions per tick, and cumulative cost.

FR-067: The live view shall show current tick, ticks per second, requests, tokens, and cost.

FR-068: A run's owner shall be able to pause, resume, step one tick, set a target speed, and stop a run, and the effect shall be applied by the service rather than by the browser.

FR-141: A viewer shall receive the run's current state on connecting, whether it is the first connection, a reconnection, or a late arrival, and shall recover from a dropped connection without a page reload.

### 4.10 Baseline mode and fallback

FR-069: With Jev off, every decision shall be made by documented fixed-weight rules over the same signals, with the same question shapes and the same cadence, so that only the decision source differs between a baseline run and a Jev run.

FR-070: If a Jev decision is not answered within 2,000 milliseconds or returns an error, the affected agents shall use the baseline rules for that decision and the engine shall emit a fallback event.

FR-071: A run's record shall state whether Jev was enabled and shall count fallbacks.

### 4.11 Decision transport

FR-072: No secret shall be delivered to the browser. The Jev key shall exist only in service configuration and in the environment of the simulation process.

FR-073: Outbound decision requests shall be rate-limited below the published service limit against one budget shared by every simulation in the deployment, with a configurable ceiling. A simulation shall obtain its share of that budget before each chunk and shall not exceed it. A retry-after response shall be honored. Usage and model fields shall be passed back unchanged.

FR-074: The simulation process shall order the decision-ready mice of a tick by a deterministic spatial sort and group them into requests of up to 8, so that a request carries mice near one another without confining a group to a fixed region. Cats shall be grouped with each other the same way and shall never be grouped with mice.

### 4.13 Accounts and sign-in

FR-075: The system shall authenticate people with Google, requesting only the openid, email, and profile scopes.

FR-076: On first sign-in the system shall create an account holding the Google subject identifier, email address, display name, and avatar URL, and no other personal attribute.

FR-077: On every sign-in the system shall refresh the stored email, name, and avatar from the identity provider.

FR-078: A session shall expire 30 days after it is issued, whether or not it has been used in the meantime, and shall be carried in a cookie that page scripts cannot read.

FR-079: The system shall provide a sign-out action that ends the session immediately.

FR-080: The sign-in screen shall state what is stored about a person and how long runs are kept, before they sign in.

FR-081: An account whose email appears in the owner allowlist shall be marked an owner, recomputed at each sign-in.

FR-082: A failed or cancelled sign-in shall create no account and shall show a message saying the attempt can be retried.

### 4.14 Run lifecycle and capacity

FR-083: A run shall have exactly one status: queued, running, paused, completed, failed, or cancelled.

FR-084: Only these transitions shall be permitted: queued to running or cancelled; running to paused, completed, failed, or cancelled; paused to running, failed, or cancelled. Any other transition is an error.

FR-085: A subject shall have at most one run in queued, running, or paused status at a time. Owners are exempt.

FR-086: The deployment shall run at most 20 simulations at once, default, configurable. With more than one running, the shared request budget of FR-073 shall be divided among them, so throughput per run falls as concurrency rises rather than any run being refused or the published limit exceeded.

FR-087: A run that cannot start because the deployment is at capacity shall be queued, and the person shall see its position in the queue.

FR-088: A queued run shall start automatically when capacity frees, whether or not the person is present.

FR-089: A person shall be able to cancel a queued run, which removes it.

FR-090: A run shall reach a terminal status exactly once, and its totals shall not change afterwards. The transition shall be idempotent, and any report arriving for a run already in a terminal status shall be discarded and recorded.

### 4.15 Server-side execution and resume

FR-091: The simulation shall execute on the server in a process dedicated to one run, and not in the browser.

FR-092: A run shall continue to completion whether or not anyone is watching.

FR-093: The engine shall serialize its complete state at every chunk boundary: generator state, every entity with its memories and intents, all timers and cooldowns, occupancy, and the summary series so far.

FR-094: If a simulation process stops without reporting completion, the system shall start a replacement from the last serialized state and continue from the first tick after the last written chunk.

FR-095: A resumed run shall produce an event stream with no gap and no repeated tick.

FR-096: After two consecutive failed resumes a run shall be marked failed, retaining every chunk already written.

FR-097: A simulation process shall authenticate every report to the service with a token issued for that run alone, and shall be able to write only into that run's storage.

### 4.16 Record storage and access

FR-098: The engine shall close a chunk at 250 ticks or 8 megabytes of uncompressed events, whichever comes first.

FR-099: Each chunk shall be compressed and stored as one object, immutable once written.

FR-100: The system shall write one summary segment per chunk, covering that chunk's ticks and holding population by sex and by personality, mice sheltering, deaths by cause, births, mean nutrition, mean fear, decisions, tokens, and cost. A segment shall be written once and never rewritten. A reader needing the whole run shall concatenate its segments.

FR-101: No process shall hold an entire run record in memory at any time.

FR-102: The system shall serve any chunk of a run to an authorized caller, by sequence number or by the tick it contains.

FR-103: Replay shall read chunks in sequence and shall make no decision call.

FR-104: A run's record shall be readable while the run is still in progress, covering the ticks written so far.

### 4.17 Library and export

FR-105: A signed-in person shall see a list of their own runs, newest first, with status, progress, preset, cost, creation time, and expiry.

FR-106: A person shall be able to open, rename, and delete any run they own.

FR-107: Deleting a run shall remove its chunks, summary, serialized state, share links, and stored objects.

FR-108: A person shall be able to export any run they own as one archive containing the configuration, the summary series, and every chunk.

FR-109: A person shall be able to export a run's configuration and seed alone, as a file the configuration screen can import.

FR-110: The interface shall state how large an export will be before it begins.

### 4.18 Sharing

FR-111: The owner of a run shall be able to create a share link for it.

FR-112: A share link shall carry an unguessable token, shown to the owner once, and the system shall store only a hash of it.

FR-113: Anyone holding a live share link shall be able to watch or replay that run, including the inspector and including locating the chunk containing any given tick, without an account.

FR-114: A share link shall grant read access only. No action that changes a run shall be reachable through one.

FR-115: The owner shall be able to revoke a share link, and it shall stop working immediately.

FR-116: A share link whose run is deleted, expired, or revoked shall return the same not-found response in all three cases.

### 4.19 Quotas and budget

FR-117: The system shall meter Jev usage per subject per day, in input tokens and requests, resetting at midnight UTC.

FR-118: The system shall enforce a daily decision budget for each signed-in account, each anonymous session, and each network address, all configurable. Every applicable budget shall be consulted before a simulation is granted its next allowance, and the first refusal shall deny it. An anonymous simulation's budget shall be keyed primarily to the network address, so discarding a cookie does not reset it.

FR-119: The system shall enforce a daily cost budget for the deployment as a whole, configurable.

FR-120: Owners shall be exempt from per-subject budgets but not from the deployment budget.

FR-121: A run that exhausts any applicable budget shall continue on baseline rules and shall show a banner saying why and when the budget resets.

FR-122: A run whose estimate exceeds the remaining budget shall not be refused outright; the person shall be offered a baseline run or a shorter run that fits.

FR-123: Every metering decision shall be recorded against the run and the subject, with tokens and cost.

### 4.20 Public mode

FR-124: The deployment shall have a setting that makes authentication optional.

FR-125: With authentication optional, a visitor without an account shall receive a signed anonymous session and shall be able to configure and run simulations under anonymous budgets.

FR-126: An anonymous run shall expire 24 hours after it was created, and everything stored about it, including any record of its decision usage, shall be removed within 24 hours of that expiry.

FR-127: An anonymous visitor shall not be able to create share links, and the action shall not appear.

FR-128: With authentication optional, no sign-in route shall be reachable and nothing shall link to one.

### 4.21 Account data and deletion

FR-129: A person shall be able to see everything stored about them, and the interface shall state that it is the complete list.

FR-130: A person shall be able to export their profile, run metadata, and usage history as one file.

FR-131: A person shall be able to delete their account, after confirming by typing a word the interface names.

FR-132: Deleting an account shall remove the profile and every run, chunk, summary segment, serialized state, share link, usage record and stored object belonging to it, and shall invalidate every session of that account on every device, not only the one making the request.

FR-133: If deletion cannot begin because storage is unreachable, the system shall change nothing and shall say so.

### 4.23 Trust boundary and coordination

FR-142: The coordinator shall choose every storage key a simulation writes and shall grant that simulation single-object, time-limited write access to each one. A simulation process shall hold no storage credential and shall not name a storage key.

FR-143: A simulation resuming from a serialized state shall be granted single-object, time-limited read access to that state and to nothing else.

FR-144: The token authenticating a simulation's reports shall be issued afresh on every simulation start, so that a process the system has replaced cannot report into its replacement's run.

FR-145: A viewer connecting to a running simulation shall be served the current world state obtained from that simulation, not from stored data.

FR-146: The system shall maintain an index of the sessions belonging to each account, sufficient to invalidate all of them.

### 4.22 Settings and operations

FR-134: Authentication, decisions, every budget, the request-rate ceiling, the capacity limits, the retention periods, the chunk tick count and byte cap, and the price per million tokens shall each be deployment settings, changeable by editing configuration and redeploying rather than by changing program logic.

FR-135: A signed-in person's runs shall be retained 30 days by default, owners' exempt, and the interface shall badge runs within 7 days of expiry.

FR-136: A scheduled job shall run daily to remove expired runs and retry any storage deletion that previously failed.

FR-137: Every storage object whose removal fails shall be recorded and retried until it succeeds.

FR-138: Errors from the browser, the service, and the simulation process shall be reported to one place, with alerts on sign-in failure rate and on decision fallback rate.

FR-139: The system shall record no analytics about people and shall contain no third-party tracking. Counting visits is not tracking people: the deployment may measure aggregate usage by a cookieless beacon that sets no identifier and cannot follow a person between sites. Nothing that identifies, profiles or follows an individual is permitted, and no analytics product that does so may be added, whatever its name.

FR-139a: The beacon shall be a deployment setting, absent by default. A build shall carry no site's identity, so a copy run locally or by anyone else serves a page with no beacon in it at all.

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
| Food respawn (default) | 60 |
| Memory sentence lifetime | 300 |
| Maximum intent hold before re-deciding | 12, or 6 when panicked |

## 5. Jev Decision Contract

This section fixes what is asked, when, with what options, and what code does with the answer. Exact instruction and criteria wording is left to the technical specification, subject to the rules below.

**State rules.** Every value sent to Jev is a word or short phrase, never a number, coordinate, or percentage. Distances are adjacent, very close, nearby, or far, on the boundaries fixed in the technical specification. Bearings are compass words. Nutrition is full, fed, hungry, very hungry, or starving. Cat state is words such as prowling, stalking toward you, eating. Shelter is described as a free mousehole adjacent, very close, nearby or far, or none in reach. The mouse's personality description and its memory sentences, each marked seen or heard, are included verbatim. Only what is within perception, smell, or memory is sent.

**Mouse decision request.** One request per decision, containing the questions below. Questions marked speculative are always asked when their precondition holds and are read only when the drive answer makes them relevant. Mice inside holes make no requests.

| Question | Type | Asked when | Options or levels | Code consumes it as |
|---|---|---|---|---|
| drive | Choice | Every mouse decision | explore always; eat if any food signal perceived; flee if danger perceived or a danger memory is fresh; hide if an available hole exists; seek mate if eligible and a candidate is visible; nest if pregnant past gestation and an available hole exists | Probabilities become weights on the signal terms: eat on food, flee away from danger, hide and nest on shelter, seek mate on mate, explore on continuing the current direction of travel. The highest option is the intent label; confidence below 0.5 sets the low-confidence flag |
| fear | Score | Every mouse decision | unconcerned, wary, alarmed, panicked | Highest level maps to the danger-field reach multiplier 0.5, 1.0, 1.5, 2.0; panicked halves the intent hold; recorded for the mean-fear chart |
| approach suspect food | Noul | Speculative: nearest food signal is at a location with a death or escape memory | yes or no | Read only when drive is eat: below 0.5 removes that source from the food field for this intent |
| mate choice | Choice | Speculative: eligible and one or more candidates visible | One option per visible candidate, described by personality, condition, and distance, plus none | Read only when drive is seek mate: sets the approach target; none means wait |
| nest site | Score | Speculative: pregnant past gestation and adjacent to an available hole | dangerous, uneasy, reasonably safe, safe | Read only when drive is nest: reasonably safe or better permits birth into this hole |

**Cat decision request.** One request per decision.

| Question | Type | Asked when | Options | Code consumes it as |
|---|---|---|---|---|
| target | Choice | One or more mice outside holes in perception and the cat is prowling or resting, or its target was lost, caught, or dropped | One option per visible mouse, described by apparent speed, isolation, proximity to other mice, distance, and whether it is heading for a hole, plus none worth it | Sets the target; none worth it keeps prowling |
| mode | Choice | Same request as target | prowl, stalk, pounce (only if a target is within 3 cells and cooldown is zero), rest | Sets the mode for the next intent |

**Batching rule.** Up to 8 mice share one request, chosen by a deterministic spatial sort so that a group is made of mice near one another. Each mouse's state sits under its own key, and every question's instruction names that key. Cats are grouped with each other and never with mice.

**Baseline substitution.** When Jev is off or a decision falls back, the same questions are answered by fixed rules: drive weights from nutrition band, danger presence, and shelter availability; fear from nearest cat distance; approach suspect food as yes only when nutrition is very low, deliberately blunt so the rule is visibly a rule; mate choice as nearest candidate; nest site as safe when no cat has been perceived within 100 ticks and no known trap lies within five cells, and uneasy otherwise. The event records which source answered.

## 6. Non-Functional Requirements

NFR-001 Simulation throughput: with decisions on, a Medium default run shall sustain at least 2 ticks per second while no more than five simulations are running in the deployment, and shall degrade predictably rather than fail beyond that as the shared request budget is divided. With decisions off, at least 30 ticks per second regardless of concurrency. The rate a run is achieving shall be visible while it runs.

NFR-002 Viewer rendering: the live view shall render at least 30 frames per second on the Large preset at its caps on a current laptop, independent of the rate at which simulation frames arrive, which may be lower.

NFR-003 Cost: a 2,000-tick Medium default run whose population stays near its starting size shall cost under $0.50 at the configured price. Because decision volume scales with living population and the Medium cap is 160 mice, a run that breeds successfully may exceed that; the live meter shall never lag the true total by more than one chunk, and the daily budgets of FR-118 are what bound spend, not this figure.

NFR-004 Reproducibility: the engine shall be deterministic given seed, configuration and the sequence of decision answers. Replaying a stored run shall reproduce its event stream exactly, excluding fields that record wall-clock measurement. Restoring a serialized state and continuing shall produce the same stream as running straight through when the same answers are supplied. A run resumed live after a failure re-asks the decision model and may therefore diverge from the run it replaces; that is expected, and only the no-gap, no-repeat guarantee of FR-095 applies to it.

NFR-005 Secrets: every secret shall exist only in service configuration and process environment. No browser-delivered asset and no API response shall contain key material, checked in the build.

NFR-006 Data minimization: the only personal data collected shall be the Google subject identifier, email address, display name and avatar URL of a signed-in person; a salted hash of the network address retained solely for rate limiting, which is also personal data and is rotated daily; and the platform's own request logs, which retain the network address in the clear together with the city, region and network operator it resolves to.

The request logs are a deliberate exception to the rest of this requirement and the narrowest one available: the platform does not offer a way to log a request without its address, so the choice is logs or no logs. They are retained for seven days by the platform and are not forwarded anywhere, exported, joined to anything else, or used for any purpose other than seeing what the deployment is being asked to do. Turning them off is a configuration change and no code depends on them. No cross-site tracking, fingerprinting, or script capable of identifying a person shall be present in any page served to a person. One cookieless aggregate-usage beacon is permitted, currently Cloudflare Web Analytics, which sets no cookie and no identifier; its token shall be validated before it is written into the page, because a value able to close an HTML attribute is script injection whatever its origin. Error reports from the browser shall be forwarded by the service rather than sent from the page, with the address removed. Simulation telemetry describes simulated animals and a subject's own usage.

NFR-007 Browser support: current desktop releases of Chrome, Firefox and Safari, with no dependency on local storage for correctness. Browser tests shall run against at least one Chromium engine and one WebKit engine.

NFR-008 Rate-limit resilience: no run shall fail because the decision service rate-limited a request. The service shall back off and the run shall fall back to baseline rules.

NFR-009 Accessibility: all controls shall be operable by keyboard with a visible focus indicator and a logical order, and no state shall be conveyed by colour alone. Both halves shall be covered by tests.

NFR-010 Engine isolation: the engine shall have no dependency on a browser, a network, a clock, or any coordination protocol, and shall run headless under Node for tests and for baseline-only runs. The prohibition on reading a clock, reaching the network, touching a document, or drawing randomness outside the injected generator shall be enforced by a lint rule rather than by convention, because a clock read is the one that silently destroys determinism.

NFR-011 Bounded memory: no process shall hold more than one chunk and its summary segment in memory. Memory use shall not grow with a run's length or tick count, and this shall hold for the analysis views as well as the simulation, so any computation over a whole record shall stream its chunks rather than load them.

NFR-012 Availability: the service shall remain able to sign people in, list runs, and replay stored runs while the decision service is unavailable.

NFR-013 Start latency: a run shall begin producing frames within 10 seconds of being started when capacity is available, and shall be reported as failed to start after 30 seconds. The 10 seconds is the target and the 30 seconds is the timeout.

NFR-014 Stream latency: a viewer shall receive the current world state within 2 seconds of connecting, sourced from the running simulation rather than from stored data, and shall then receive frames within 200 milliseconds of the tick they describe under normal conditions.

NFR-015 Storage growth: storage shall be bounded by the retention policy, and expired data shall be removed within 24 hours of expiry.

NFR-016 Authorization: every route that reads or changes a run shall resolve ownership before acting. No route shall imply access from possession of an identifier alone.

## 7. Epics and User Story Summary

Ten epics, ordered so each can be built and tested on what precedes it. Story summaries are written for the person they serve; full stories with acceptance criteria follow in planning.

**EP-1 Engine core** (FR-001 to FR-052, FR-069). Headless, deterministic, baseline rules only, including mouseholes. As Carson, I can run a seeded baseline simulation under Node and get an identical event stream every time. As a researcher, I can read the mechanics in one place and see each activity's cost in ticks. As a watcher, I can see hungry mice slow down and get caught, and a brood emerge from a hole about thirty ticks after birth.

**EP-2 Jev decision layer** (FR-058, FR-070 to FR-074, section 5). As an evaluator, I can see the exact words Jev received and the distribution it returned. As Carson, I can switch a decision between Jev and baseline and watch the movement change. As Carson, I can run sixty mice without hitting a rate limit.

**EP-3 Configuration and personality mix** (FR-051 to FR-056, FR-140). As a watcher, I can set 70 percent bold and see the mix hold across births. As a researcher, I can export a configuration and seed and hand it to someone else. As a watcher, I cannot start a run that exceeds the grid's caps, and I can see what a run will cost before I start it.

**EP-4 Server-side execution and resume** (FR-091 to FR-097, FR-098 to FR-101). As a watcher, I can start a long run, close the tab, and come back to find it finished. As Carson, I can kill the simulation process and watch the run pick up where it left off. As an operator, no process grows in memory as a run gets longer.

**EP-5 Run lifecycle and capacity** (FR-083 to FR-090). As a watcher, I see my position in the queue when the service is busy and my run starts on its own. As an operator, one person cannot occupy the deployment.

**EP-6 Records, replay, comparison** (FR-057, FR-059 to FR-063, FR-102 to FR-104). As a researcher, I can replay a run tick by tick and reproduce it exactly. As Carson, I can find the decision that walked a mouse into a trap and see every stage of it. As a watcher, I can put the 70 percent bold run beside the 30 percent bold run and see the one setting that differs.

**EP-7 Viewer** (FR-064 to FR-068, FR-141). As a watcher, I can tell males from females, bold from cautious, and an empty hole from one holding a brood at a glance. As an evaluator, I can click a mouse mid-chase and read its fear and drive weights. As a watcher, my connection can drop and recover without losing my place.

**EP-8 Accounts and sign-in** (FR-075 to FR-082, FR-129, FR-130). As a visitor, I can sign in with Google and see exactly what is stored about me. As a person, I can export everything the service holds about me.

**EP-9 Library, sharing, export** (FR-105 to FR-116). As a watcher, my runs follow me to another machine. As an owner, I can send someone a link and they can watch without an account, and I can revoke it. As a researcher, I can export a run and archive it.

**EP-10 Quotas, public mode, operations** (FR-117 to FR-128, FR-131 to FR-139). As an operator, I can open the deployment to the public without handing out an unbounded bill. As a person, I can delete my account and know everything went with it. As an operator, I learn that sign-in is broken before a visitor tells me.

## 8. Out of Scope

A game you play: no player-controlled animal. A validated ecology model: no claim of biological realism. An open ecosystem editor: fixed cast, no user-defined species or rules. Cross-run parameter learning: no optimizer tuning the rules between runs. Generated text or narration: the model never writes prose.

Also excluded from this version: personality inheritance and the lineage view it would enable; terrain and obstacles beyond mouseholes; mice leaving a hole for any reason but hunger; alarm chains beyond one hop; teams, organizations, or any shared ownership of a run; collaborative or simultaneous viewing controls, so a share viewer watches but never drives; identity providers other than Google; a mobile layout; payment, billing, or per-person paid quotas; and any public listing or discovery of other people's runs.

## 9. Assumptions and Constraints

**Assumptions.** Blended probabilities read as behavior rather than jitter. Event-driven cadence keeps a run inside the published request limit. Replay from stored answers is the only reproducible comparison, since the model is self-consistent but not guaranteed identical. Cost stays near $0.20 per thousand ticks at sixty mice. Bucketed words carry enough signal for good tradeoffs. Batching up to eight tile-mates per request does not degrade accuracy. A predation-limited colony is the stable arrangement. Fast food respawn with numerous cats holds a population at its level across a long run, where a starvation-limited colony decays as the run goes on. Shelter is the strongest single lever on survival: on the small map, holding everything else equal, 12 mouseholes leaves half of all seeds extinct where 24 leaves none. Defaults therefore give roughly one hole per two or three mice. Twenty concurrent simulations is enough for the audience this serves.

**Constraints.** The decision service publishes 1,200 requests per minute, 250,000 tokens per second, 64,000 tokens per request with 32,000 for state plus the longest question, and text-only input at $0.042 per million input tokens, described as an early-access rate. The model is documented as weak at arithmetic, counting, numeric comparison, and large states full of irrelevant detail, and its score levels are not to be interpolated into magnitudes. Personal data is present, users are scoped to the United States, and the data-minimization baseline applies.

## 10. Open Questions

Whether a share link should be able to carry a starting tick, so an owner can point someone at the moment a colony collapsed.

Whether a person should be able to keep a run past 30 days without exporting it, for example by marking a limited number of runs to retain.

Whether the queue should be fair across people rather than first come first served, once more than one person uses the deployment at a time.

## 11. Additional Development

Full user stories with acceptance criteria for the ten epics. Wireframes for the nine screens. A user experience review. Validation that the solution is buildable as specified. Accessibility work beyond the baseline. A mobile layout. Anything in the out-of-scope list that later earns its place.

Delivered since the previous version and no longer outstanding: system architecture, user flows, the data model, the interface contracts, the exact wording of every question put to the model, the baseline rule weights, the test strategy, and the operating model.

## 12. Changes from version 2.1

Recorded in version 3.0 and unchanged: the out-of-scope list lost the single-user and browser-storage items; FR-061 was withdrawn; FR-060, FR-062, FR-068 and FR-072 to FR-074 were revised for the hosted shape; NFR-001, NFR-002, NFR-006, NFR-010 and NFR-011 were revised or replaced; the success metrics were rewritten and eight added; ten requirement groups and FR-075 to FR-141 were added; FR-001 to FR-052, the activity cost table and the decision contract carried over.

## 13. Changes in version 3.1

Applies the solution validation remediation. Nothing is withdrawn and no number is reused.

| Area | Change |
|---|---|
| Capacity | FR-073 gains a shared deployment request budget and a ceiling; FR-074 replaces tile-bounded batching with a spatial sort; FR-086 divides the budget across concurrent runs; NFR-001 becomes tiered |
| Trust boundary | FR-142 to FR-144 added: the coordinator names every key and grants single-object access, resume gets a scoped read, the report token rotates on every start |
| Viewer | FR-145 added and NFR-014 revised: the opening state comes from the running simulation |
| Memory | FR-060 and FR-100 replace the rewritten whole-run summary with one segment per chunk; NFR-011 extends the bound to the analysis views |
| Fear | FR-043 states that the factor scales the distance danger is felt over and must change the gradient's shape, because a magnitude scale is cancelled by normalization |
| Control | FR-090 makes the terminal transition idempotent and discards late reports |
| Quotas | FR-118 consults every applicable budget and keys anonymous budgets to the address |
| Sessions | FR-078 fixes the lifetime as absolute; FR-132 and FR-146 make every session revocable |
| Metrics | SM-01, SM-03, SM-05, SM-06, SM-07, SM-10, SM-14 and SM-16 revised so each can be measured with what the design records; NFR-004 scoped honestly for a live resume |
| Privacy | NFR-006 names the address hash as personal data, requires daily rotation, and moves browser error reporting behind the service |
| Corrections | FR-015 nine candidates; FR-038 the exploration term; FR-057 spawn and resume events; FR-113 chunk lookup by tick; FR-126 within 24 hours of expiry; FR-134 settings stated honestly; FR-140 an estimate with a source; the four-bucket distance vocabulary; the baseline rule for suspect food; the epic list citing FR-051 and FR-052 rather than FR-042 and FR-043 |
