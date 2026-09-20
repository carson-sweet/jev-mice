---
title: jev-mice User Stories
version: 1.0
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: initial version, approved as final by Carson Sweet on 2026-09-19
previous_file: none
---

# jev-mice User Stories

**Version:** 1.0 (final)

**Date:** 2026-09-19

**Work item:** WI-001

**Format:** Gherkin. These are the direct input to the executable specifications, so every scenario is written to be mechanically translatable into a test that fails before the behaviour exists.

**Sources:** Requirements v3.1 for what must be true, user flows v1.1 for how a person gets there, the technical specification v1.1 for the mechanics a scenario asserts against, and the wireframes for what a screen shows.

**Who the stories are written for.** No personas were defined, so each story names one of the four audiences from discovery: **Carson**, testing where model-driven agents stop looking intelligent; an **evaluator**, deciding whether the decision model suits agent-like work; a **watcher**, who wants to see a colony live and die and change one thing; and a **researcher**, who needs runs they can reproduce and cite. Where a story serves the system rather than a person, it says so.

**Numbering.** `US-Enn-nn`, epic then story. Numbers are permanent. Each story names the requirements it satisfies and, where one applies, the success metric it helps verify.

**Reading the scenarios.** `Given` sets up a world, `When` performs one action, `Then` asserts one observable outcome. Numbers in scenarios are the real configured values from the requirements, not illustrations, so a scenario that says 250 ticks means the configured chunk size.

## EP-1 Engine core

Deterministic simulation with code-only decisions. Every story here runs headless with no network, no account and no key.

### US-E01-01 Deterministic seeded run

**As** Carson
**I want** a run with the same seed, configuration and decision answers to produce exactly the same events
**So that** I can tell a change in behaviour from a change in luck

Satisfies FR-007, NFR-004, NFR-010. Verifies SM-03.

```gherkin
Scenario: Identical inputs produce an identical event stream
  Given a Medium world with seed 1749302811 and code-only decisions
  When I run 500 ticks twice from a fresh engine each time
  Then both runs emit the same events in the same order with the same sequence numbers

Scenario: A different seed produces a different stream
  Given a Medium world with code-only decisions
  When I run 500 ticks with seed 1749302811 and again with seed 1749302812
  Then the two event streams differ

Scenario: The engine cannot reach outside itself
  Given the engine package
  When I inspect its source for a clock read, a network call, a document reference, or a draw outside the injected generator
  Then none is present and the lint rule that forbids them is active
```

### US-E01-02 Tick clock and activity costs

**As** a researcher
**I want** every activity to cost the number of ticks the specification states
**So that** I can reason about a run's timeline and reproduce a published result

Satisfies FR-004, FR-005, FR-011, FR-014, FR-017.

```gherkin
Scenario: A healthy mouse moves one cell per tick
  Given a mouse at 80 percent nutrition with no danger and no food in reach
  When 10 ticks pass
  Then it has moved at most 10 cells

Scenario: A hungry mouse moves at half speed
  Given a mouse at 45 percent nutrition
  When 10 ticks pass
  Then it has moved at most 5 cells

Scenario: A starving mouse moves at a third speed
  Given a mouse at 20 percent nutrition
  When 12 ticks pass
  Then it has moved at most 4 cells

Scenario: The run stops at its configured tick count
  Given a run configured for 2,000 ticks
  When the simulation reaches tick 2,000
  Then a run-ended event is emitted and no further tick advances
```

### US-E01-03 Nutrition, speed and starvation

**As** a watcher
**I want** hunger to slow a mouse down and eventually kill it
**So that** I can see why the slow ones get caught

Satisfies FR-010, FR-013, FR-014, FR-017. Verifies SM-09.

```gherkin
Scenario: Nutrition decays every tick
  Given a mouse at 100 percent nutrition and a decay rate of 0.5 per tick
  When 100 ticks pass without eating
  Then its nutrition is 50 percent

Scenario: A mouse starves when nutrition reaches zero
  Given a mouse at 1 percent nutrition with no food in reach
  When enough ticks pass for nutrition to reach zero
  Then it dies and the death event carries the cause starvation and no other cause

Scenario: Eating restores nutrition and consumes the pile
  Given a hungry mouse standing on a food pile
  When it eats for 3 ticks without interruption
  Then its nutrition is 100 percent and the pile is gone

Scenario: Fleeing interrupts eating without consuming the pile
  Given a mouse that has been eating for 1 tick
  When a cat moves into an adjacent cell
  Then the mouse flees, the pile remains, and its nutrition is unchanged
```

### US-E01-04 Cats hunt, capture and eat

**As** a watcher
**I want** cats to pursue mice and be occupied after a kill
**So that** the pressure on the colony rises and falls the way a predator's does

Satisfies FR-022 to FR-030. Verifies SM-09.

```gherkin
Scenario: A cat captures a mouse it moves onto
  Given a cat adjacent to a mouse that is not in a mousehole
  When the cat moves into the mouse's cell
  Then the mouse dies with the cause cat and the cat begins eating

Scenario: An eating cat is stationary for ten ticks
  Given a cat that has just captured a mouse
  When 10 ticks pass
  Then the cat has not moved, and on the eleventh tick it is prowling again

Scenario: A cat gives up on a target it cannot close on
  Given a cat stalking a mouse whose distance has not decreased
  When 30 ticks pass
  Then the cat drops the target

Scenario: A cat loses a target that reaches shelter
  Given a cat stalking a mouse next to a free mousehole
  When the mouse enters the mousehole
  Then the cat loses its target and rests for 10 ticks

Scenario: A cat cannot be harmed by the world
  Given a cat and a live trap
  When the cat moves onto the trap
  Then nothing happens to the cat and the trap is unchanged
```

### US-E01-05 Food, traps and evasion

**As** a watcher
**I want** traps to look like food to a naive mouse and to kill some of the mice that enter them
**So that** learning to avoid them means something

Satisfies FR-031 to FR-036. Verifies SM-09.

```gherkin
Scenario: A full mouse evades a trap half the time
  Given a mouse at 100 percent nutrition entering a trap
  When the evasion is rolled 10,000 times with a seeded generator
  Then it survives between 49 and 51 percent of the time

Scenario: Evasion erodes with nutrition
  Given a mouse at 40 percent nutrition entering a trap
  When the evasion is rolled 10,000 times
  Then it survives between 19 and 21 percent of the time

Scenario: A trapped mouse blocks the trap then the trap moves
  Given a mouse that has just died in a trap
  When 10 ticks pass
  Then the corpse and the trap are gone from that cell and a live trap exists elsewhere, at least 5 cells from any living mouse

Scenario: A trap smells like food to a mouse that knows nothing about it
  Given a trap and a food pile at equal distance from a mouse with no relevant memory
  Then the trap contributes half the food signal of the pile

Scenario: A trap is recognised once a death is remembered
  Given a mouse that holds a memory of a death at a trap's location
  Then that trap contributes to its danger signal and not to its food signal
```

### US-E01-06 Mouseholes shelter, breed and raise pups

**As** a watcher
**I want** mouseholes to be the one safe place, and scarce
**So that** shelter is something the colony competes for

Satisfies FR-009 to FR-011, FR-020, FR-044 to FR-050.

```gherkin
Scenario: A hiding mouse cannot be caught
  Given a mouse inside a mousehole and a cat adjacent to it
  When 20 ticks pass
  Then the mouse is alive and the cat has not entered the mousehole

Scenario: A hiding mouse still gets hungry and leaves
  Given a mouse entering a mousehole at 70 percent nutrition
  When enough ticks pass for its nutrition to fall below 60 percent
  Then it leaves the mousehole and requests a decision

Scenario: A hole holds one adult or one brood, never both
  Given a mousehole occupied by an adult mouse
  When another mouse with the hide intent reaches it
  Then that mouse does not enter and continues toward another free hole

Scenario: Breeding requires a free hole nearby
  Given two eligible mice adjacent to each other with no free mousehole within 3 cells
  When they would otherwise mate
  Then no mating occurs

Scenario: A litter is born into a hole and emerges about thirty ticks later
  Given a pregnant mouse past gestation adjacent to a free mousehole rated reasonably safe
  When she stands still for 5 ticks
  Then between 2 and 4 pups are born into the hole at 75 percent nutrition
  And each pup leaves when its nutrition falls below 60 percent
  And the hole becomes free when the last pup has left

Scenario: A birth beyond the population cap is lost and recorded
  Given a world already at its mouse cap
  When a litter would be born
  Then no pup is created and a cap-limited birth event is emitted
```

### US-E01-07 Perception, memory and one-hop alarm

**As** an evaluator
**I want** a mouse to know only what it has seen or been told
**So that** the decisions it is asked to make rest on a believable view of its world

Satisfies FR-037 to FR-042.

```gherkin
Scenario: Perception is bounded
  Given a mouse with a perception radius of 6 cells
  When a cat is 7 cells away
  Then that cat does not appear in the mouse's state

Scenario: A vigilant mouse sees further
  Given a vigilant mouse
  Then its perception radius is 8 cells rather than 6

Scenario: Witnessing a death adds a memory
  Given a mouse within perception of a trap death
  When the death occurs
  Then the mouse gains a memory sentence naming a trap death, its bearing and how recently it happened, tagged as seen

Scenario: Memory is bounded and expires
  Given a mouse holding 5 memories
  When it witnesses a sixth event
  Then the oldest memory is dropped
  And any memory older than 300 ticks is gone

Scenario: Alarms travel one hop and no further
  Given mouse A holding a memory tagged seen, adjacent to mouse B
  When they exchange memories
  Then B holds that memory tagged heard
  And when B later meets mouse C, that memory is not passed on
```

### US-E01-08 Population caps and configuration validation

**As** a watcher
**I want** to be told what a world can hold before I start a run
**So that** I do not wait for a run that was never going to work

Satisfies FR-001 to FR-003, FR-008, FR-054.

```gherkin
Scenario: Caps derive from grid area
  Given the Medium preset of 80 by 50 cells
  Then the caps are 160 mice, 80 food piles, 80 mouseholes, 40 traps and 10 cats

Scenario: A configuration above a cap is rejected with the cap named
  Given the Medium preset
  When I ask for 100 male and 100 female mice
  Then the configuration is rejected and the message states that Medium allows 160 mice in total

Scenario: A cell holds at most one animal
  Given two mice
  When both would move into the same cell on the same tick
  Then only one occupies it and the other chooses a different cell

Scenario: World size does not depend on the viewport
  Given the Medium preset
  When the viewport is resized
  Then the world remains 80 by 50 cells and only the rendering scale changes
```

## EP-2 Decision layer

Everything about asking the model and using its answer. These stories run against recorded responses; none calls the live service.

### US-E02-01 Numbers become words

**As** an evaluator
**I want** the model to receive words rather than numbers
**So that** it is being asked the kind of question it is good at

Satisfies FR-072, contract section 5. Verifies SM-02.

```gherkin
Scenario: Nutrition is bucketed
  Given mice at 95, 70, 45, 20 and 5 percent nutrition
  Then their hunger reads full, fed, hungry, very hungry and starving

Scenario: Distance is bucketed
  Given objects at 1, 3, 5 and 9 cells away
  Then their distances read adjacent, very close, nearby and far

Scenario: The bucket boundaries match the movement bands
  Given the nutrition boundaries at 60 and 30 percent
  Then a mouse first described as hungry is also the first that moves at half speed

Scenario: No number reaches the model
  Given any state object built for any mouse
  Then it contains no numeral, coordinate or percentage
```

### US-E02-02 Requests are batched by proximity

**As** Carson
**I want** decision-ready mice near one another to share a request
**So that** the run stays inside the request budget without sending unrelated mice together

Satisfies FR-074. Verifies SM-01.

```gherkin
Scenario: Up to eight mice share a request
  Given 12 decision-ready mice
  When requests are composed
  Then 2 requests are produced, carrying 8 and 4 mice

Scenario: Each mouse is addressed by its own key
  Given a request carrying 3 mice
  Then each mouse's state sits under its own key and every question names the key it refers to

Scenario: Cats are never mixed with mice
  Given 4 decision-ready mice and 2 decision-ready cats
  Then no request contains both a mouse and a cat

Scenario: Grouping is deterministic
  Given the same set of decision-ready mice
  When requests are composed twice
  Then the same mice are grouped together both times
```

### US-E02-03 Probabilities become movement

**As** Carson
**I want** the whole probability distribution to steer a mouse, not just the winner
**So that** hunger genuinely competes with fear instead of one switching the other off

Satisfies FR-015, FR-038, contract section 5. Verifies SM-07.

```gherkin
Scenario: Every drive contributes its weight
  Given a drive answer of 0.6 eat, 0.3 flee and 0.1 explore
  When the mouse chooses its next cell
  Then the food term is weighted 0.6, the danger term 0.3 and the exploration term 0.1

Scenario: Candidates include standing still
  Given a mouse with no attractive neighbour
  Then its current cell is among the nine candidates and it may remain there

Scenario: Fields are normalized before weighting
  Given two fields whose raw magnitudes differ by a factor of ten
  When the candidate cells are scored
  Then each field contributes on the same scale and the weights decide the outcome

Scenario: The recorded intent is the top drive
  Given a drive answer of 0.41 flee, 0.29 hide, 0.22 eat and 0.08 explore
  Then the recorded intent is flee and the decision is flagged low confidence because the confidence is below 0.5
```

### US-E02-04 Fear widens the berth

**As** Carson
**I want** fear to change how much room a mouse gives danger
**So that** the fear question has an effect I can see

Satisfies FR-043. Verifies SM-07.

```gherkin
Scenario: Fear changes the shape of the danger gradient
  Given a cat 3 cells away and the nine candidate cells scored
  When the fear level is unconcerned, then wary, then alarmed, then panicked
  Then the normalized danger values across those candidates differ at each level

Scenario: A panicked mouse re-decides sooner
  Given a mouse whose last fear level was panicked
  Then its intent is held for 6 ticks rather than 12

Scenario: Fear does not change the drive weights
  Given a drive answer and two different fear levels
  Then the weights applied to the food, mate and shelter terms are identical in both cases
```

### US-E02-05 Falling back to code-only rules

**As** a watcher
**I want** a run to keep going when the model cannot answer
**So that** a service problem costs me quality rather than the whole run

Satisfies FR-069 to FR-071, FR-121. Verifies SM-15.

```gherkin
Scenario: A slow answer falls back
  Given a decision request that does not return within 2,000 milliseconds
  Then the affected mice use the code-only rules for that decision and a fallback event is emitted naming the reason timeout

Scenario: The run continues and says so
  Given a run whose budget is exhausted at tick 640
  Then the run continues to its configured tick count
  And a banner states that decisions have been running on code-only rules since tick 640
  And the run record counts the fallbacks

Scenario: Code-only answers are labelled
  Given any decision answered by the code-only rules
  Then its event records the source as baseline rather than as the model

Scenario: A code-only run differs from a model run in one thing only
  Given two runs with the same seed and configuration, one with the model and one without
  Then their event streams differ only from the first decision onward
```

### US-E02-06 Living inside the request budget

**As** the operator
**I want** every simulation to draw from one shared request budget
**So that** the deployment cannot exceed the published limit however many runs are active

Satisfies FR-073, FR-086, NFR-001, NFR-008. Verifies SM-01.

```gherkin
Scenario: A simulation holds a lease before it issues requests
  Given a simulation at a chunk boundary
  When it receives its acknowledgement
  Then the acknowledgement carries a requests-per-minute lease and the simulation does not exceed it

Scenario: The budget is divided as concurrency rises
  Given a request budget of 1,000 per minute
  When 1 simulation is running, then 5, then 20
  Then each holds roughly the whole budget, a fifth of it, and a twentieth of it

Scenario: Throughput degrades rather than failing
  Given 20 simulations running at once
  Then each continues at a reduced tick rate and none is refused or rate-limited

Scenario: The achieved rate is visible
  Given a run in progress
  Then the live view shows the ticks per second it is currently achieving
```

## EP-3 Configuration and personality mix

### US-E03-01 Configure and validate a run

**As** a watcher
**I want** to set up a colony and be told immediately when a value will not work
**So that** I am not surprised after pressing start

Satisfies FR-053 to FR-055, FR-140.

```gherkin
Scenario: Medium defaults are prefilled
  Given I open the configuration screen with the Medium preset
  Then the form shows 30 male mice, 30 female mice, 4 cats, 8 traps, 20 food piles, 12 mouseholes, food respawn 40, decay 0.5 and 25 percent for each personality

Scenario: An out-of-range value is flagged beside the field
  When I set the tick count to 50
  Then an error appears beside the tick count stating the range is 100 to 20,000 and the run cannot start

Scenario: Personality percentages must total one hundred
  When I set bold to 70 and cautious to 20 and leave the others at 25
  Then the sum is shown as failing and the run cannot start

Scenario: The estimate is shown before starting and labelled
  Given a valid Medium configuration
  Then the screen shows an expected decision count, token count, cost and duration, each labelled an estimate, with the basis stated
```

### US-E03-02 Personality mix holds across births

**As** a watcher
**I want** the mix I set to apply to pups as well as to the mice I start with
**So that** an experiment about personality is not undone by reproduction

Satisfies FR-051, FR-052. Verifies SM-06.

```gherkin
Scenario: The starting cohort is drawn from the configured mix
  Given a configuration of 70 percent bold and 30 percent cautious
  When the world is created
  Then each starting mouse emits a spawn event recording its personality
  And no mouse has a personality outside the configured set

Scenario: Pups are drawn from the same mix
  Given the same configuration
  When a litter is born
  Then each pup's personality is drawn from the configured percentages using the run's seeded generator

Scenario: The mix holds at scale
  Given a run reaching 1,000 or more mice ever alive
  Then each personality's share is within 5 points of its configured percentage

Scenario: A small run reports without a verdict
  Given a run reaching only 200 mice ever alive
  Then the observed deviation is reported and no pass or fail is claimed

Scenario: Personality changes behaviour
  Given a vigilant mouse and a social mouse
  Then the vigilant mouse perceives at 8 cells and the social mouse exchanges alarms at 2 cells
```

### US-E03-03 Export and import a configuration

**As** a researcher
**I want** to hand someone the exact world I ran
**So that** they can reproduce my result rather than approximate it

Satisfies FR-056, FR-109.

```gherkin
Scenario: A configuration and seed export as one file
  Given a configured run
  When I export the configuration
  Then one file contains every setting and the seed

Scenario: An exported configuration imports unchanged
  Given an exported configuration file
  When I import it on a fresh configuration screen
  Then every field matches the original, including the seed

Scenario: An invalid file is rejected the same way a form is
  When I import a file whose mouse count exceeds the preset cap
  Then the same validation message appears beside the same field
```

### US-E03-04 Run a code-only twin

**As** an evaluator
**I want** to run the same world without the model
**So that** I can see what the model actually contributed

Satisfies FR-069. Verifies SM-05.

```gherkin
Scenario: A twin is prefilled from a finished run
  Given a completed run using the model
  When I choose to run its code-only twin
  Then the configuration screen opens with every setting and the seed copied and locked, and decisions set to code-only

Scenario: The twin differs in exactly one setting
  Given a run and its twin
  When I compare them
  Then the decision source is the only difference the comparison highlights
```

## EP-4 Server-side execution and resume

### US-E04-01 A run outlives the tab that started it

**As** a watcher
**I want** to start a long run and walk away
**So that** I am not tied to a browser tab for an hour

Satisfies FR-091, FR-092. Verifies SM-11.

```gherkin
Scenario: The simulation continues with nobody watching
  Given a run in progress at tick 400
  When I close the tab and 600 ticks worth of time passes
  Then the run has advanced and continues toward its configured tick count

Scenario: Returning shows the run where it now is
  Given a run I left at tick 400
  When I open the library later
  Then the run shows its current tick and I can open it and carry on watching

Scenario: A run that finished while I was away is complete when I return
  Given a run I left in progress
  When it reaches its configured tick count before I return
  Then the library shows it completed and offers replay
```

### US-E04-02 The record is written as the run proceeds

**As** a researcher
**I want** the record written continuously rather than at the end
**So that** nothing is lost if something goes wrong and a partial run is still usable

Satisfies FR-098 to FR-101, FR-104, NFR-011.

```gherkin
Scenario: A chunk closes on ticks or on size
  Given a run in progress
  When 250 ticks have elapsed since the last boundary, or 8 megabytes of uncompressed events have accumulated
  Then a chunk is closed, compressed and stored, whichever came first

Scenario: Each chunk carries its own summary segment
  When a chunk is stored
  Then a summary segment covering the same ticks is stored alongside it and is never rewritten

Scenario: No process holds the whole record
  Given a 20,000-tick run
  Then no process holds more than one chunk and its segment at any moment

Scenario: A run in progress is already readable
  Given a run at tick 900
  Then its first three chunks and their segments can be read
```

### US-E04-03 Resume after a failure

**As** a watcher
**I want** a run to survive its simulation process dying
**So that** hours of a long run are not lost to an infrastructure hiccup

Satisfies FR-093 to FR-096, FR-144. Verifies SM-12.

```gherkin
Scenario: The engine's state is saved at every boundary
  When a chunk is stored
  Then a snapshot of the complete engine state is stored with it, carrying the generator state, every entity with its memories and intents, all timers, and the current summary segment

Scenario: A killed simulation resumes from the last boundary
  Given a run at tick 812 whose last chunk ended at tick 750
  When the simulation process is killed
  Then a replacement starts from the tick-750 snapshot and continues from tick 751

Scenario: The resumed stream has no gap and no repeat
  Given a run that was resumed
  Then its event stream covers every tick exactly once

Scenario: A restored engine behaves as if it never stopped
  Given the same seed and the same decision answers
  When I run 500 ticks straight, and separately run 250, save, restore and run 250 more
  Then both produce the same event stream

Scenario: A replaced process cannot report into its replacement's run
  Given a simulation the system has declared dead and replaced
  When the old process posts a report
  Then it is rejected because its token is no longer the one in force

Scenario: Two failed resumes end the run
  Given a run whose replacement fails twice in succession
  Then the run is marked failed and every chunk already written remains readable
```

### US-E04-04 The simulation holds no storage credential

**As** the operator
**I want** a simulation process to be unable to name or reach storage on its own
**So that** a fault in one run cannot touch another

Satisfies FR-097, FR-142, FR-143, NFR-005, NFR-016. Verifies SM-13.

```gherkin
Scenario: Upload URLs are issued per object
  Given a simulation about to close a chunk
  Then it holds three single-object upload URLs issued by the coordinator, and no storage credential

Scenario: The simulation does not choose keys
  When the simulation reports a completed chunk
  Then its report carries sizes and counts and no storage key, because the coordinator already chose them

Scenario: Resume grants one read and nothing more
  Given a simulation starting from a snapshot
  Then it holds a single-object read URL for that snapshot and cannot read any other object

Scenario: An expired URL is refused
  Given an upload URL past its expiry
  When the simulation attempts to use it
  Then the upload is refused and the simulation requests a new one
```

## EP-5 Run lifecycle and capacity

### US-E05-01 One run at a time

**As** the operator
**I want** each person to have one run in progress
**So that** one person cannot occupy the deployment

Satisfies FR-083 to FR-085, FR-090.

```gherkin
Scenario: A second start is refused with a way forward
  Given I have a run in progress
  When I start another
  Then I am told which run is in progress and offered to watch it, stop it and start the new one, or cancel

Scenario: A double submission creates one run
  Given I submit the same new run twice in quick succession
  Then exactly one run is created

Scenario: Terminal status is final
  Given a completed run
  When a late report arrives for it
  Then the report is discarded and recorded, and the run's totals do not change
```

### US-E05-02 Queue when the deployment is full

**As** a watcher
**I want** to wait in line rather than be turned away
**So that** a busy moment costs me time instead of my run

Satisfies FR-086 to FR-089.

```gherkin
Scenario: A run beyond capacity is queued with a position
  Given 20 simulations already running
  When I start a run
  Then it is queued and I am shown my position

Scenario: A queued run starts on its own
  Given my run is queued at position 1
  When a running simulation finishes
  Then mine starts without my doing anything

Scenario: Leaving does not lose my place
  Given my run is queued
  When I close the tab and return later
  Then the run is either still queued or has started

Scenario: I can cancel while queued
  Given my run is queued
  When I cancel it
  Then it is removed and I can configure another
```

### US-E05-03 Control a running simulation

**As** a watcher
**I want** pause, step, speed and stop to take effect when I press them
**So that** I can examine a moment rather than chase it

Satisfies FR-006, FR-068, FR-084.

```gherkin
Scenario: Pause takes effect at the next tick
  Given a run in progress
  When I press pause
  Then the simulation stops advancing within one tick, not at the next chunk boundary

Scenario: Step advances exactly one tick
  Given a paused run at tick 612
  When I press step
  Then the run is at tick 613 and paused again

Scenario: Stop is terminal and keeps the record
  Given a run at tick 900 of 2,000
  When I confirm stop
  Then the run's status becomes cancelled and everything recorded up to tick 900 remains readable

Scenario: A viewer without control cannot control
  Given someone watching through a share link
  When they send a control command
  Then it is refused
```

## EP-6 Records, replay and comparison

### US-E06-01 Replay a stored run

**As** a researcher
**I want** to replay a finished run exactly
**So that** I can examine what happened without paying to run it again

Satisfies FR-062, FR-102, FR-103. Verifies SM-03.

```gherkin
Scenario: Replay makes no decision calls
  Given a stored run
  When I replay it from start to finish
  Then no request is made to the decision service

Scenario: Replay reproduces the stream
  Given a stored run
  When I replay it
  Then the events match the stored stream exactly, excluding the declared wall-clock fields

Scenario: A failed run replays as far as it got
  Given a run that failed at tick 7,410
  Then replay covers ticks 1 to 7,410 and the scrubber ends there
```

### US-E06-02 Scrub to any tick

**As** a watcher
**I want** to jump to the moment things went wrong
**So that** I do not watch an hour to see one minute

Satisfies FR-062, FR-102, NFR-011.

```gherkin
Scenario: Jumping loads only what is needed
  Given a 20,000-tick run of 80 chunks
  When I scrub to tick 12,340
  Then only the chunk containing that tick is fetched

Scenario: A chunk that fails to load is retryable
  Given a chunk that fails to download
  Then playback pauses at the boundary, the range is named, and a retry is offered

Scenario: Clicking a chart moves the scrubber
  Given the deaths-by-cause chart
  When I click the point where the line turns upward
  Then the scrubber moves to that tick
```

### US-E06-03 Compare two runs

**As** a watcher
**I want** to put two runs side by side
**So that** changing one setting becomes an experiment rather than an impression

Satisfies FR-063. Verifies SM-04.

```gherkin
Scenario: Differences are highlighted
  Given two runs differing only in personality mix
  When I compare them
  Then the personality mix row is highlighted and every other row is not

Scenario: Seed equality is called out
  Given two runs with the same seed
  Then the comparison states that they started in identical worlds

Scenario: A differing seed is called out too
  Given two runs with different seeds
  Then the comparison warns that outcomes cannot be attributed to the differing setting alone

Scenario: Series are distinguishable without colour
  Given two runs overlaid on one chart
  Then each series is distinguishable by line pattern as well as by colour
```

## EP-7 Viewer

### US-E07-01 Watch a run live

**As** a watcher
**I want** to see the colony moving as it is simulated
**So that** the behaviour is something I observe rather than read about

Satisfies FR-064, FR-067, FR-141, NFR-002, NFR-014. Verifies SM-08, SM-17.

```gherkin
Scenario: The current state arrives before any frame
  Given a run in progress
  When I connect
  Then I receive the current world state within 2 seconds and then frames

Scenario: The state comes from the running simulation
  Given a run whose last chunk was written 100 seconds ago
  When I connect
  Then the state I receive reflects the current tick, not the tick of the last stored snapshot

Scenario: Every kind is distinguishable without colour
  Given the grid rendering
  Then mice, cats, traps, occupied traps, food and mouseholes differ in shape as well as colour, and each mouse's nutrition band is visible

Scenario: The meter is always visible
  Given a run in progress
  Then the current tick, ticks per second, requests, tokens and cost are shown and update as the run proceeds

Scenario: The meter does not lag the true total
  Given a run that has completed 5 chunks
  Then the cost shown differs from the recorded total by at most one chunk's worth

Scenario: A default run stays under the cost ceiling
  Given a 2,000-tick Medium run at default settings whose population stays near its starting size
  Then its recorded cost is under fifty cents at the configured price
```

### US-E07-02 Inspect an animal's decision

**As** an evaluator
**I want** to see exactly what the model was asked and exactly what it answered
**So that** I can tell judgement from a script

Satisfies FR-058, FR-065. Verifies SM-02.

```gherkin
Scenario: The panel shows the decision end to end
  Given a run in progress
  When I click a mouse
  Then I see its identity, sex, personality, nutrition, age, whether it is sheltering, its memories with their seen or heard tags, and its latest decision: the state sent, every question asked, every probability and confidence returned, the fear level, the derived weights, the resulting move, and that decision's tokens and cost

Scenario: Nothing is reworded between the service and the screen
  Given a decision the model answered
  Then the state shown is the state sent, verbatim, and the probabilities shown are the probabilities returned, unrounded

Scenario: A low-confidence answer is flagged
  Given a decision whose drive confidence is 0.44
  Then the intent is shown with a low-confidence flag

Scenario: A code-only decision says so
  Given a decision answered by the code-only rules
  Then the panel names the rules that answered instead of showing a distribution

Scenario: The panel follows the animal
  Given the panel open on a mouse
  When that mouse makes a new decision
  Then the panel updates without my clicking again

Scenario: In replay the panel matches the scrubber
  Given a replay at tick 1,204
  Then the panel shows the decision current at tick 1,204 and never one from another tick
```

### US-E07-03 Reconnect without losing my place

**As** a watcher
**I want** a dropped connection to recover on its own
**So that** a flaky network does not cost me the run

Satisfies FR-092, FR-141. Verifies SM-17.

```gherkin
Scenario: A dropped connection recovers
  Given I am watching a run
  When the connection drops and is restored
  Then I receive a fresh state and frames resume, without reloading the page

Scenario: The run is unaffected
  Given my connection dropped for 60 seconds
  Then the run advanced during that time and never paused

Scenario: Reconnecting is the same path as connecting
  Given a reconnect, a first connection and a late join
  Then all three receive the current state and then frames, by the same route
```

### US-E07-04 Read the charts

**As** a watcher
**I want** the charts to cover the whole run from its first tick
**So that** joining late does not cost me the history

Satisfies FR-066, FR-100.

```gherkin
Scenario: Seven series are shown
  Given a run in progress
  Then the view shows population by sex and personality, mice sheltering, deaths by cause, mean nutrition, mean fear, decisions per tick, and cumulative cost

Scenario: Charts cover the whole run even on a late join
  Given a run at tick 1,500
  When I connect for the first time
  Then the charts show ticks 1 to 1,500, assembled from the stored summary segments

Scenario: Charts continue as the run proceeds
  Given I am watching
  Then each series extends as new segments are written
```

## EP-8 Accounts and sign-in

### US-E08-01 Sign in with Google

**As** a watcher
**I want** to sign in with an account I already have
**So that** I can keep my runs without creating another password

Satisfies FR-075 to FR-078, FR-080, FR-082.

```gherkin
Scenario: Signing in creates an account with four fields
  Given I have never signed in
  When I complete Google sign-in
  Then an account is created holding my Google identifier, email, name and avatar, and nothing else about me

Scenario: What is stored is disclosed before I sign in
  Given the sign-in screen
  Then it states what is stored and that runs are kept 30 days, before I press anything

Scenario: Only three scopes are requested
  When sign-in begins
  Then the request asks for openid, email and profile and no other scope

Scenario: A cancelled sign-in creates nothing
  When I cancel at the Google screen
  Then no account exists and I am told the attempt can be retried

Scenario: A session expires thirty days after it is issued
  Given a session issued 30 days ago and used daily since
  Then it is expired, because the lifetime does not extend with use
```

### US-E08-02 See and export what is stored about me

**As** a person with an account
**I want** to see everything the product holds about me
**So that** I can judge whether I am comfortable with it

Satisfies FR-129, FR-130, NFR-006.

```gherkin
Scenario: The account screen lists everything
  Given I open my account
  Then I see my Google identifier, email, name and avatar, and a statement that this is the complete list

Scenario: My data exports as one file
  When I export my data
  Then I receive one file containing my profile, the details of every run, and my usage history

Scenario: No tracking is present
  Given any page served to me
  Then it contains no third-party script, pixel or fingerprinting, including for error reporting
```

### US-E08-03 Sign out everywhere

**As** a person with an account
**I want** to end my sessions on every device
**So that** signing out on a shared machine actually signs me out

Satisfies FR-079, FR-132, FR-146. Verifies SM-14.

```gherkin
Scenario: Signing out ends this session
  When I sign out
  Then my session no longer authenticates

Scenario: Signing out everywhere ends the others
  Given I am signed in on two devices
  When I sign out everywhere from one
  Then the session on the other no longer authenticates

Scenario: A session whose account is gone fails closed
  Given a session whose account has been deleted
  When a request arrives with it
  Then the request is unauthenticated and the session is cleared
```

## EP-9 Library, sharing and export

### US-E09-01 Keep a library of runs

**As** a watcher
**I want** my runs to follow me between machines
**So that** I can compare something I ran last week against something I ran today

Satisfies FR-105, FR-106, FR-135.

```gherkin
Scenario: My runs are listed newest first
  Given I have six runs
  Then the library shows each with its status, progress, preset, decision source, cost, creation time and expiry, newest first

Scenario: My runs follow me
  Given I created a run on one machine
  When I sign in on another
  Then the run is in my library

Scenario: I see only my own runs
  Given another person has runs
  Then none of them appears in my library and none is reachable by guessing an identifier

Scenario: A run close to expiry is badged
  Given a run expiring in 4 days
  Then the library badges it

Scenario: Renaming and deleting work from the list
  When I rename a run
  Then the new name is shown
  When I delete a run
  Then it is gone along with its chunks, segments, snapshot and any share links
```

### US-E09-02 Share a run by link

**As** an evaluator
**I want** to be sent a link and see the run without signing up
**So that** evaluating the product does not start with creating an account

Satisfies FR-111 to FR-116. Verifies SM-18.

```gherkin
Scenario: An owner creates a link and sees it once
  Given a completed run
  When I create a share link
  Then the full link is shown once and only a hash of it is stored

Scenario: Anyone with the link can watch and replay
  Given a share link and no account
  When I open it
  Then I can watch or replay the run, including the inspector, and can locate the chunk holding any tick

Scenario: A share viewer cannot change anything
  Given I am viewing through a share link
  Then no control, delete, export or share action is available to me, and sending one anyway is refused

Scenario: Revoking stops the link immediately
  Given a share link someone is holding
  When the owner revokes it
  Then the next request with it is refused

Scenario: Deleted, expired and revoked look the same
  Given three links whose runs were deleted, expired and revoked
  Then all three return the same not-found response, so the link cannot be used to learn what exists
```

### US-E09-03 Export a run to keep it

**As** a researcher
**I want** to take a full record away
**So that** a result survives the thirty-day retention

Satisfies FR-108, FR-110.

```gherkin
Scenario: The size is stated before the download starts
  Given a run of 8 chunks totalling 41 megabytes
  When I open export
  Then the size is shown before I begin

Scenario: A full record exports as one archive
  When I export the full record
  Then I receive one archive containing the configuration, every summary segment and every chunk

Scenario: An interrupted export can be restarted
  Given an export interrupted part way
  When I start it again
  Then it completes and nothing server-side has changed
```

### US-E09-04 Runs expire predictably

**As** the operator
**I want** storage to be bounded
**So that** the deployment does not grow without limit

Satisfies FR-126, FR-135 to FR-137, NFR-015.

```gherkin
Scenario: A signed-in run is kept thirty days
  Given a run created 31 days ago belonging to a person who is not an owner
  When the sweep runs
  Then the run, its chunks, segments, snapshot, share links and usage rows are gone

Scenario: An owner's runs do not expire
  Given a run belonging to an allowlisted owner
  Then it has no expiry and the sweep leaves it alone

Scenario: A failed object deletion is retried until it succeeds
  Given an object whose deletion fails
  Then it is recorded and retried, and no row points at an object that no longer exists
```

## EP-10 Quotas, public mode and operations

### US-E10-01 A daily budget I can see

**As** a person using the product
**I want** to know how much of today's budget I have left
**So that** a run does not stop being interesting halfway through for a reason I cannot see

Satisfies FR-117, FR-118, FR-120, FR-123.

```gherkin
Scenario: Remaining budget is always visible
  Given I am signed in
  Then the header shows my remaining budget as a bar with numbers beside it

Scenario: A run that will not fit offers a way forward
  Given a run estimated at 8.9 million tokens and 2.1 million left
  When I try to start it
  Then I am offered a code-only run, a shorter run that fits, or waiting for the reset

Scenario: Owners are unlimited
  Given an allowlisted owner
  Then no per-subject budget applies and the header says so

Scenario: Usage is recorded per chunk, not per call
  Given a run of 8 chunks
  Then 8 usage records exist, each carrying the tokens and cost the service reported
```

### US-E10-02 Budgets that cannot be sidestepped

**As** the operator
**I want** limits that survive a cleared cookie
**So that** one visitor cannot drain the deployment

Satisfies FR-118, FR-119, FR-125.

```gherkin
Scenario: Every applicable budget is consulted
  Given an anonymous visitor whose session budget has room but whose address budget does not
  When the next allowance is requested
  Then it is refused and the refusal names the address budget

Scenario: Clearing a cookie does not reset the budget
  Given an anonymous visitor who has spent today's budget
  When they clear their cookie and return
  Then the address budget still applies and they do not get a fresh allowance

Scenario: The deployment budget stops everyone gracefully
  Given the deployment's daily cost budget is spent
  Then every run continues on code-only rules and each says why and when the budget resets
```

### US-E10-03 Public mode

**As** the operator
**I want** to open the deployment without accounts
**So that** anyone can try it without signing up

Satisfies FR-124 to FR-128. Verifies SM-16.

```gherkin
Scenario: No sign-in exists in public mode
  Given authentication is switched off
  When I open the app
  Then I land on the configuration screen, no sign-in route is reachable, and nothing links to one

Scenario: An anonymous visitor can run a simulation
  Given public mode
  Then I can configure and run a simulation under the anonymous budgets

Scenario: Sharing is unavailable
  Given public mode
  Then no share action appears anywhere and attempting one is refused

Scenario: An anonymous run expires within a day of its expiry
  Given an anonymous run created 24 hours ago
  When the sweep runs after its expiry
  Then the run, its chunks, segments, snapshot and usage records are gone from every store
```

### US-E10-04 Delete my account

**As** a person with an account
**I want** leaving to remove everything
**So that** I can stop using the product without leaving a trace behind

Satisfies FR-131 to FR-133. Verifies SM-14.

```gherkin
Scenario: What will be removed is counted before I confirm
  When I choose to delete my account
  Then I am shown how many runs, share links and usage records will go, and told my shared links will stop working

Scenario: Deletion requires typing the word
  Given the confirmation dialog
  Then the delete action stays disabled until I type the word the interface names

Scenario: Everything goes, in every store
  When I confirm
  Then my profile, every run, chunk, summary segment, snapshot, share link, usage record and coordinator state is removed, and my sessions on every device stop working

Scenario: Unreachable storage changes nothing
  Given the object store is unreachable
  When I confirm deletion
  Then nothing is removed and I am told to try again
```

### US-E10-05 Know when something is wrong

**As** the operator
**I want** to hear about the two failures that are silent
**So that** I do not learn from a visitor that the product is broken

Satisfies FR-138, FR-139, NFR-012, NFR-005. Verifies SM-10.

```gherkin
Scenario: Sign-in failures raise an alert
  Given more than one sign-in in ten fails over fifteen minutes
  Then an alert is raised

Scenario: A silent slide to code-only rules raises an alert
  Given more than half of decisions fall back over fifteen minutes
  Then an alert is raised

Scenario: A daily line summarises the deployment
  Given a day has passed
  Then one message reports runs started, completed and failed, the fallback rate, spend, storage used and the queue high-water mark

Scenario: No secret reaches a browser or a response
  Given the built bundle and every route
  Then neither contains anything matching a key pattern, checked in the build and in tests

Scenario: Errors reach one place from all three runtimes
  Given an error in the browser, in the service and in a simulation
  Then all three are reported, and the browser's goes through this service rather than to a third party
```

## Coverage

Forty-four stories across ten epics, carrying 174 scenarios. Every epic's requirement group from the traceability map has at least one story, and every success metric SM-01 to SM-18 is named by at least one story as something it helps verify.

## Open questions

Whether the engine stories should be split further for implementation, since US-E01-06 covers mouseholes, breeding and pups in one story and could reasonably be three.

Whether US-E10-05 belongs in the plan at all, since it describes operating the product rather than using it, and could be a runbook instead of a story.
