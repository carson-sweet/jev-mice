---
id: ISSUE-017
title: "Test gaps that let a defect ship"
type: chore
status: todo
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
