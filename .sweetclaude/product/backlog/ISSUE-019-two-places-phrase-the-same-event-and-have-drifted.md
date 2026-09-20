---
id: ISSUE-019
title: "Two places phrase the same event, and have drifted"
type: chore
status: done
priority: P2
effort: s
epic: null
sprint: null
origin: code-review-2026-09-20
prs: []
created: 2026-09-20
---

# ISSUE-019: Two places phrase the same event, and have drifted

## What

`apps/sim/src/index.ts` (`logFrom`) and `apps/host/src/turns.ts` (`describe`)
independently turn the same `SimEvent` into a sentence, and already disagree:
a starvation reads "m0001 starved." in the live log and "m0001 died of hunger."
in the turn history; a lost litter reads with and without "the world is full."

## Acceptance

One function, used by both. The engine already has this pattern in
`memory.ts` (`sentenceFor`), and both apps depend on the engine.

## Resolution

Fixed 2026-09-20. `packages/engine/src/narrate.ts` is the one narrator, beside
the memory sentences it resembles, and both the live log and the turn history
call it. Five tests, including one that runs 600 turns of a busy world and
asserts the narrator has a line for every event anyone is shown.
