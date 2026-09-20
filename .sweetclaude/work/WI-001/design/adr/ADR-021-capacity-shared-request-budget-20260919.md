---
title: ADR-021: Spatial-sort batching and a shared deployment request budget
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

# ADR-021: Spatial-sort batching and a shared deployment request budget

**Date:** 2026-09-19

**Status:** Accepted

## Context

Validation found the capacity model about fourteen times over the decision service's published limit of 1,200 requests per minute. Batching merged at most eight mice from the same 16-by-16 tile, and 7.5 decision-ready mice scattered over twenty tiles almost never shared one, so measured traffic was 6.76 requests per tick per run rather than the one the specification assumed. FR-073, which requires an outbound rate limit, had no mechanism anywhere and each container throttled independently.

## Decision

Three changes. Batching groups decision-ready mice by a deterministic spatial sort and fills to eight without regard to tile boundaries, and cats are batched with each other; this takes traffic to 1.74 requests per tick, a 3.9x improvement. The GlobalLimits object leases request rate as well as token allowance, granted on the chunk acknowledgement that already carries the allowance, so every container throttles against one shared budget and FR-073 gains a home. NFR-001 becomes tiered: at least two ticks per second up to five concurrent runs, degrading predictably beyond, with the achieved rate shown in the live meter. The concurrency cap stays at twenty.

## Rationale

Server-side execution already removed the reason a run must be fast, because a run now outlives the tab that started it. Degrading throughput keeps the deployment available to everyone; refusing new runs or silently exceeding the limit does not. Leasing rate through the object that already meters cost adds no new component and no new round trip.

## Consequences

Easier: the limit is respected by construction, the cap can stay generous, and a quiet deployment is fast. Harder: throughput is no longer a single number, the live view has to show it, and batched mice are no longer guaranteed to be tile-neighbours, which is registered as an assumption to measure.

## Alternatives Considered

Keep tiles and cap concurrency at five (rejected: refuses service to hold a number). Lengthen the decision cadence to sixteen ticks (rejected: less responsive animals for the same effect). Request a higher limit from the service (worth doing, but not a design).
