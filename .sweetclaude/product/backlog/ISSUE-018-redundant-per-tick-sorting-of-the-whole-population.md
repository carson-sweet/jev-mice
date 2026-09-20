---
id: ISSUE-018
title: "Redundant per-tick sorting of the whole population"
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

## Resolution

Fixed 2026-09-20. `sortedMice()` is memoized against a version counter bumped on
every birth, death and restore. Versioned rather than keyed on the tick, because
mice are born and die within a tick, so a tick is not a safe key.

Measured over 1,200 turns after settling, same seed:

| preset | before | after |
|---|---|---|
| medium, 160 mice | 599 ticks/s | 846 ticks/s |
| large, 357 mice | 100 ticks/s | 157 ticks/s |

The large preset's headroom over the 30 ticks/s requirement goes from 3.3x to
5.2x. The determinism and snapshot suites pass unchanged, which is the thing a
caching change most risks.

## Still open

The genuinely quadratic mate scans in `sourcesFor` and `contextFor` remain, as
does the per-call allocation in `scoresFor`. Both were identified as smaller
than this one and neither is pressing at current populations.
