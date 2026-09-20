---
id: ISSUE-014
title: "The engine retains every event for the life of a run"
type: bug
status: todo
priority: P0
effort: s
epic: null
sprint: null
origin: code-review-2026-09-20
prs: []
created: 2026-09-20
---

# ISSUE-014: The engine retains every event for the life of a run

## What

The engine exposes `drain()`, which clears its event buffer. `apps/sim` never
calls it; it only calls `events()` and slices from a remembered index
(`apps/sim/src/index.ts:351`). The buffer therefore grows monotonically for the
whole run.

## Measured

3,000 ticks on the medium preset at a stable population retains 335,880 events
and grows the heap from 9 MB to 136 MB. That projects to about 2.2 million
events and roughly 847 MB at the 20,000-tick maximum, held until the process
ends.

## Acceptance

The simulation drains what it has consumed. A test asserts the retained buffer
does not grow without bound over a long run, and the determinism and snapshot
suites still pass, since draining changes what `events()` returns.
