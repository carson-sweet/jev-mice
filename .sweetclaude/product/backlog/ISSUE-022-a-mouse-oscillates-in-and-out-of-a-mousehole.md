---
id: ISSUE-022
title: "A mouse oscillates in and out of a mousehole"
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

# ISSUE-022: A mouse oscillates in and out of a mousehole

## What

Hunger below the fed band ejects an adult from a hole, and nothing stopped it
re-entering on the same tick because its drive still said hide. It entered, was
thrown out, entered again, burning every turn on the doorstep until something
caught it standing in the open.

## How it was found

Not by the review. It surfaced while fixing ISSUE-016: the danger floor changed
which mice ended up beside a hole while hungry, and the existing invariant test
"a hiding mouse cannot be caught" started failing. Measured on one seed over 800
turns: 5 oscillations before the floor, 19 after, so the defect predates the
change and the change amplified it.

## Why it was invisible

The invariant test compares ticks, not order within a tick. A mouse that left a
hole and was caught in the open on the same tick reads as having been caught
while sheltering, so the test was reporting the oscillation as a different fault.

## Resolution

Fixed 2026-09-20. `availableDrives` no longer offers hide to a mouse below the
fed band, which is the same threshold that ejects it. The question's own wording
already said hide is not for a mouse that would die waiting; the two rules
simply disagreed. Delivering a litter is still offered, since that is not
waiting out danger. Three tests, including one asserting no mouse re-enters
within a turn of leaving.
