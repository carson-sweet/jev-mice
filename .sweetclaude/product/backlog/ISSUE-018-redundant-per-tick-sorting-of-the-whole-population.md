---
id: ISSUE-018
title: "Redundant per-tick sorting of the whole population"
type: chore
status: todo
priority: P2
effort: s
epic: null
sprint: null
origin: code-review-2026-09-20
prs: []
created: 2026-09-20
---

# ISSUE-018: Redundant per-tick sorting of the whole population

## What

`exchangeAlarms` (`packages/engine/src/engine.ts:848`) and `resolveMating`
(`:789`) each call `sortedMice()`, a fresh copy and sort of the whole mouse
array, from inside a loop that is already iterating a `sortedMice()` result.
That is O(M squared log M) where O(M squared) would do: about 187,000 redundant
comparisons per tick at 160 mice, and roughly ten times that at the large
preset's cap.

There are about a dozen other `sortedMice()` calls per tick that could share one
sorted array, since mouse order cannot change within a tick.

## Acceptance

One sort per tick, threaded through. Throughput measured before and after on the
medium and large presets. Determinism unchanged.
