---
id: ISSUE-012
title: "A resumed run diverged because Infinity is not JSON"
type: bug
status: done
priority: P0
effort: s
epic: null
sprint: null
origin: code-review-2026-09-20
prs: []
created: 2026-09-20
---

# ISSUE-012: A resumed run diverged because Infinity is not JSON

## What

`serialize()` clones through `JSON.parse(JSON.stringify(...))` and the stored
snapshot is gzipped JSON, so `CatState.bestDistance` of `Infinity` became
`null`. A restored cat read its own best distance as null, never beat it, and
abandoned every target after thirty turns of false patience. Every resumed run
diverged whenever a cat held the initial placeholder at the snapshot point.

## How it was found

Stressing the invariant rather than reading it: 162 snapshot round trips over
three configurations, three seeds and eighteen cut points. Three failed, all on
the specified defaults at cuts 7, 11 and 13, diverging 37 turns later on a
`cat_targeted` event.

## Why the suite missed it

Two of the three resume tests passed the live snapshot object rather than a JSON
copy, so `Infinity` survived. The one that did round-trip used a seed whose cats
held finite values at its cut point.

## Resolution

Fixed in 44f9932. The placeholder is `number | null` by declaration and compared
explicitly. New guard in `packages/engine/test/ep4/snapshot-wire.spec.ts` takes
its snapshot before the first turn, where every cat still holds the initial
placeholder whatever the seed does later, and asserts no number in a snapshot
has become null. All 162 round trips pass.
