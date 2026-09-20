---
title: ADR-016: Jev is called from the container with the key in its environment; the Run Durable Object meters per chunk
version: 1.0
status: superseded
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: initial
previous_file: none
---

# ADR-016: Jev is called from the container with the key in its environment; the Run Durable Object meters per chunk

**Date:** 2026-09-19

**Status:** Accepted Superseded by ADR-025 on 2026-09-20: there is no container, so Jev is called from the Run Durable Object. Chunk metering is unchanged in substance -- what changed is where the calls originate.

## Context

The browser never talks to TypeSafe now. Quotas are Durable Object counters (ADR-007). Routing every Jev call through a Durable Object would hit its 6-connection ceiling and add a hop to a 2,000 millisecond budget.

## Decision

The container receives TYPESAFE_API_KEY in its environment at start and calls the TypeSafe SDK directly, batching decision-ready mice by 16-by-16 tile up to 8 per request and running batches concurrently. Metering moves to chunk granularity: before each chunk the container asks its Run Durable Object for a token allowance; the Durable Object reserves against the subject's QuotaCounter and the GlobalBudget; after the chunk the container reports actual usage from the SDK's usage field and the Durable Object reconciles and writes a jev_usage row. A denied allowance, JEV_ENABLED false, a 2,000 millisecond timeout, or an error yields baseline decisions for the affected batch or chunk and a fallback event. The Worker's public API has no Jev route. Supersedes ADR-008; ADR-007's counters stand with the checkpoint moved from per call to per chunk.

## Rationale

One metering checkpoint per few hundred ticks instead of one per call, no Durable Object on the hot path, and the key stays server-side in a process the operator controls.

## Consequences

Easier: throughput, simpler public API, honest accounting from the SDK's own usage numbers. Harder: the key exists in container environments as well as Worker secrets, and an allowance can be overspent by at most one chunk before reconciliation.

## Correction, 2026-09-19

The object named GlobalBudget here is called GlobalLimits from the data model onward, because it also holds the active-run count, the queue and the shared request-rate budget. The name in this record is historical.

## Alternatives Considered

Route calls through the Durable Object (rejected: connection ceiling and latency). Browser calls a metered Worker route (rejected: the browser no longer runs the engine).
