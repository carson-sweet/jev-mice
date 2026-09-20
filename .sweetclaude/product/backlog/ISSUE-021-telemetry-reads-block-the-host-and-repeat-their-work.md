---
id: ISSUE-021
title: "Telemetry reads block the host and repeat their work"
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

# ISSUE-021: Telemetry reads block the host and repeat their work

## What

`apps/host/src/turns.ts:52` uses `readFileSync`, `gunzipSync` and `JSON.parse`
on a whole chunk, inline in the request path, with no cache. Two consequences:
the single thread stalls for the decode so every other request waits, and paging
a 250-turn chunk ten turns at a time decompresses the same 2.2 MB twenty-five
times.

## Acceptance

Async read and decode, plus a small cache of decoded chunks keyed by run and
sequence. Storage format unchanged.
