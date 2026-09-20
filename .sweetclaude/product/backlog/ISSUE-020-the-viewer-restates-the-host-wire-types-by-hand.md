---
id: ISSUE-020
title: "The viewer restates the host wire types by hand"
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

# ISSUE-020: The viewer restates the host wire types by hand

## What

`apps/web/src/api.ts` hand-declares `RunSummary`, `ViewerMessage`, `TurnStats`,
`TurnEvent`, `Turn` and `TurnWindow`, duplicating `apps/host/src/runs.ts` and
`apps/host/src/turns.ts`. The two meet only at a JSON boundary typed by a
generic cast, so a field renamed on the host stops appearing in the browser with
no compile error.

## Acceptance

One shared module both import, as `Frame` and `LogEntry` already are.
