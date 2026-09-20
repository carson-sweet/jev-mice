---
title: ADR-023: The viewer's opening state comes from the container through a cached frame
version: 1.0
status: accepted
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: initial
previous_file: none
---

# ADR-023: The viewer's opening state comes from the container through a cached frame

**Date:** 2026-09-19

**Status:** Accepted

## Context

The interface design promised every viewer a full state snapshot before any frame, on first connection, reconnect and late join, within two seconds. No component held that state: the Run object keeps four small keys, the container protocol had no world-state endpoint, and the stored snapshot object is up to 125 seconds stale. The most-exercised path in the product had no data source.

## Decision

The container exposes a world-state endpoint. The Run object keeps the most recent frame it broadcast in memory and serves it to a connecting viewer when it is fresher than one second, fetching from the container otherwise. A run with no viewers holds nothing, because frames are only cached once something is watching.

## Rationale

Reuses the frame the object already handles instead of introducing storage. The common case, a viewer joining a run someone else is already watching, costs nothing.

## Consequences

Easier: reconnect and late join are the same path as first connect. Harder: one more container endpoint, and the object holds one frame per watched run.

## Alternatives Considered

Serve the stored snapshot object (rejected: up to 125 seconds stale). Keep entity state in the object (rejected: duplicates the engine's state and can drift).
