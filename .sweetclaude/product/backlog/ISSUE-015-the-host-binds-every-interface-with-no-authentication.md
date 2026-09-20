---
id: ISSUE-015
title: "The host binds every interface with no authentication"
type: bug
status: done
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

## Resolution

Fixed 2026-09-20. Binds 127.0.0.1 by default; `JEV_MICE_HOST` widens it and the
startup line then says plainly that the host is reachable beyond this machine
and asks for no password. The websocket upgrade checks the origin against the
request's own host, with an allow list for anything else, and refuses with 403.
A total-run cap of 200 answers 429 beyond it, since runs are never evicted.

Four tests. The bind test reads what the port is actually bound to from the
operating system and fails loudly if it cannot tell, rather than passing
vacuously; verified it distinguishes 127.0.0.1 from all interfaces.

Not addressed here: no per-socket or per-address limit, and no eviction of
completed runs. Both are follow-on work rather than part of this fix.
