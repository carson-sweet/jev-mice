---
title: ADR-007: Quotas and the global Jev budget as Durable Object counters with baseline fallback
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

# ADR-007: Quotas and the global Jev budget as Durable Object counters with baseline fallback

**Date:** 2026-09-19

**Status:** Accepted

## Context

Jev cost must be bounded per user, per anonymous session, per IP, and globally. Counters need exactness and daily reset without a persistent server process.

## Decision

A QuotaCounter Durable Object per subject key (user:id, anon:cookieId, ip:hash) holds the day's input tokens and requests, resets on an alarm at UTC midnight, and answers reserve and commit calls from the Jev route. A GlobalBudget Durable Object singleton holds the deployment's daily cost against a configured cap. When any applicable counter is exhausted, or JEV_ENABLED is false, the Jev route returns a jev_unavailable response and the engine switches that run to baseline decisions with a visible banner; the run does not fail. Every quota decision is recorded as a usage row and a telemetry event. An owner allowlist of email addresses is exempt.

## Rationale

Durable Objects give single-threaded, exact counters keyed by subject at negligible cost. Reserve-then-commit against the estimated token count keeps the cap honest under concurrency; the SDK's usage field reconciles the estimate.

## Consequences

Easier: exact caps, graceful degradation. Harder: one more binding type; estimation before the call and reconciliation after.

## Correction, 2026-09-19

The object named GlobalBudget here is called GlobalLimits from the data model onward, because it also holds the active-run count, the queue and the shared request-rate budget. The name in this record is historical.

## Alternatives Considered

KV counters (rejected: eventually consistent, races under load). Postgres counters (rejected: a write per Jev call on the hot path). No per-subject limits (rejected: one visitor can drain the budget).
