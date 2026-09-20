---
id: ISSUE-017
title: "Test gaps that let a defect ship"
type: chore
status: done
priority: P1
effort: l
epic: null
sprint: null
origin: code-review-2026-09-20
prs: []
created: 2026-09-20
---

# ISSUE-017: Test gaps that let a defect ship

## What

263 tests are less cover than the number suggests.

- `packages/engine/test/ep2/movement.spec.ts:27` is named "Danger falls off
  faster than food" and asserts only that nine candidate cells came back. It
  would pass if the danger and food fields were deleted.
- `packages/engine/src/signals.ts` has no direct test at all. This is where the
  fear-as-divisor subtlety lives, the one the solution validation caught, and a
  reintroduction would be silent.
- The baseline rule ladder, which runs every animal by default, has no test of
  any decision it makes. See ISSUE-016, which that gap allowed.
- `apps/host/src/turns.ts` has no test file. Untested: a missing chunk, a
  corrupt gzip, a window spanning two chunks, a run still in progress, a turn
  with events but no summary point.
- `packages/engine/src/metrics.ts` is exported and entirely untested.
- `packages/engine/test/ep3/personality.spec.ts:40` asserts only that a vigilant
  mouse exists, not that it behaves differently.
- `validateConfig` has several untested branches reachable from the form.

## Acceptance

Each item above has a direct test. The empty assertion either tests what its
name claims or is renamed to what it does.

## Resolution

Largely fixed 2026-09-20. Tests went from 269 to 322.

- `signals.ts` has 14 direct tests in `packages/engine/test/ep2/signals.spec.ts`,
  including one asserting fear widens the reach of danger rather than scaling the
  field, which is the subtlety the solution validation caught and which nothing
  guarded.
- The rule ladder, the fear rule and the cat rule have 16 direct tests in
  `ep2/ladder.spec.ts`. That gap is what allowed ISSUE-016.
- `turns.ts` has 15 tests in `apps/host/test/turns.spec.ts` against fabricated
  storage: a missing chunk, a missing summary, a corrupt gzip, a window spanning
  two chunks, a window past the end, a window before the first turn, a run that
  has produced nothing, and the event phrasing. Direct and in milliseconds,
  where the only previous cover was a sixty-second end-to-end run.
- The empty assertion in `ep2/movement.spec.ts` now tests what it can see, the
  nine reachable cells, and its name says so. The falloff claim it used to make
  is tested for real in signals.spec.ts.
- `ep3/personality.spec.ts` now asserts that nothing but a vigilant mouse
  perceives beyond the ordinary reach, rather than that a vigilant mouse exists.

## Still open

`metrics.ts` remains untested and unused by any app. `validateConfig` still has
untested branches: a single personality percentage out of range while the sum is
100, a negative or fractional count, and decay or starting nutrition out of
bounds. Both are small and worth doing; neither is load-bearing today.
