---
title: ADR-019: Engine snapshot at every chunk boundary and automatic resume after container failure
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

# ADR-019: Engine snapshot at every chunk boundary and automatic resume after container failure

**Date:** 2026-09-19

**Status:** Accepted. Storage path partially superseded by ADR-022 on 2026-09-19. The snapshot is read on resume through a presigned URL.

## Context

Long runs are why simulation moved server-side. A container can die mid-run. Late-joining viewers need a current-state snapshot, and determinism tests need a way to compare a straight run against an interrupted one.

## Decision

The engine exposes serialize() and restore(): the complete simulation state (generator state, every entity with memories and intents, timers and cooldowns, hole occupancy, trap and food state, current tick, chunk and summary cursors) as a versioned JSON document. At every chunk boundary the container posts the snapshot alongside the chunk; the Run Durable Object stores it in R2 under runs/{id}/snapshot.json.gz, replacing the previous one. If the container exits without posting done, the Durable Object starts a new container with resumeFrom pointing at the snapshot; the engine restores and continues from the first tick after the last written chunk. Viewer snapshots for late joiners are derived from the same document.

## Rationale

One serialization format serves resume, viewers, and tests. The core determinism test becomes: run N ticks straight, and run N/2 ticks, serialize, restore, run N/2 more; the event streams must be identical.

## Consequences

Easier: long-run robustness, late-join viewers, a strong correctness test. Harder: every piece of engine state must be serializable and restored in the same order; a snapshot per boundary adds a small object.

## Alternatives Considered

Mark failed at the last chunk (rejected: loses forward progress and repeats Jev spend). Snapshot now, resume later (rejected: pays the cost without the benefit).
