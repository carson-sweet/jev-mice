---
id: ISSUE-021
title: "Telemetry reads block the host and repeat their work"
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

## Resolution

Fixed 2026-09-20. Reads are async, so decoding no longer stalls the one thread
every other request shares, and decoded chunks are kept in a six-entry cache
keyed by run and sequence, which is enough because paging is sequential and
local. A `forget(runId)` drops a run's entries.

Measured end to end, ten pages of ten turns against a 600-turn run: 38ms cold,
12ms warm. Three tests, including one asserting a chunk is decoded once however
many pages are asked for.

A chunk that is not on disk yet is no longer distinguishable from one that is
missing, which is correct: a run in progress has not written its open chunk and
a reader may legitimately ask for it.
