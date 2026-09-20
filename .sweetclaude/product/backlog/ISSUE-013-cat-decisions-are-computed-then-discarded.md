---
id: ISSUE-013
title: "Cat decisions are computed then discarded"
type: bug
status: todo
priority: P0
effort: m
epic: null
sprint: null
origin: code-review-2026-09-20
prs: []
created: 2026-09-20
---

# ISSUE-013: Cat decisions are computed then discarded

## What

`applyDecision` in `packages/engine/src/engine.ts:499` ignores the answer it was
given for a cat. It reads neither `s.answers.target` nor `s.answers.mode` nor
`s.intent`, and instead recomputes a hardcoded nearest-and-cheapest heuristic
from scratch, overwriting whatever the provider decided.

## Why it matters

Every cat decision sent to Jev is paid for in tokens and latency and then thrown
away. The `cat_targeted` event can contradict the `decision_returned` event
emitted immediately before it, so the telemetry that exists to show the judgment
records a decision that did not happen. This defeats the premise of the project
for one of its two species.

## Also

The same branch uses the fixed `PERCEPTION.cat` of 8 rather than
`catPerception(c)`, so a hungry cat's targeting radius is 8 while every other
part of the engine, and the request sent to Jev, uses 11.

## Acceptance

A cat's target and mode come from the answer. A test asserts that a provider
returning a specific target produces a `cat_targeted` naming that target, and
that a hungry cat can target a mouse at distance 11.
