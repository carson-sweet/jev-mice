---
id: ISSUE-015
title: "The host binds every interface with no authentication"
type: bug
status: todo
priority: P1
effort: m
epic: null
sprint: null
origin: code-review-2026-09-20
prs: []
created: 2026-09-20
---

# ISSUE-015: The host binds every interface with no authentication

## What

`apps/host/src/server.ts:243` calls `server.listen(port)` with no hostname, so
Node binds `0.0.0.0` and `::` while the startup line claims localhost. No route
checks any credential. Anyone who can reach the port can list runs, create runs,
and pause, stop or re-speed any run whose id they can read from `/api/runs`.

## Also

There is no cap on the total number of runs created, only on how many run at
once. Each accepted request permanently adds a `Live` record to an in-memory map
that is never pruned and creates a directory tree on disk. The WebSocket upgrade
checks no origin, so a page on another origin can drive a run.

## Acceptance

Binds loopback by default; any other interface requires an explicit opt-in and a
shared secret. A total-run cap with eviction. An origin check on the upgrade.
Tests for each.
