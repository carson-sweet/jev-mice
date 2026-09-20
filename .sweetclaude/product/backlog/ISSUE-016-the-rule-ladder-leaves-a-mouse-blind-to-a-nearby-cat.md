---
id: ISSUE-016
title: "The rule ladder leaves a mouse blind to a nearby cat"
type: bug
status: done
priority: P1
effort: s
epic: null
sprint: null
origin: code-review-2026-09-20
prs: []
created: 2026-09-20
---

# ISSUE-016: The rule ladder leaves a mouse blind to a nearby cat

## What

In `packages/engine/src/decisions.ts:282`, with a cat 3 or 4 cells away and no
free mousehole within 4, neither the flee row (needs `dCat <= 2`) nor the hide
row (needs `dHole <= 4`) fires. Execution falls through to the nutrition, mating
and explore rows, all of which leave `flee` at zero. `scoresFor` multiplies the
danger field by the flee weight, so a zero makes the mouse's choice of
destination completely blind to the cat.

## Why it matters

This is the path taken whenever Jev is unavailable, over budget or slow, and
whenever a run is deliberately on the rules, which is the default with no key
configured. The safety net can walk a mouse alongside a stalking cat.

## Acceptance

A row covering danger at middle distance with no shelter reachable. A unit test
on `baselineDrive` asserting flee is non-zero for that context, plus tests for
every other row and its boundary values.

## Resolution

Fixed 2026-09-20. A visible cat now keeps a floor of 0.2 on the flee weight
whatever row of the ladder wins, renormalized so no row changes what it chooses.
A floor rather than another row, because the priorities were right and only the
blindness was wrong. Eleven direct tests of the ladder, the fear rule and the
cat rule in `packages/engine/test/ep2/ladder.spec.ts`, where there were none.
