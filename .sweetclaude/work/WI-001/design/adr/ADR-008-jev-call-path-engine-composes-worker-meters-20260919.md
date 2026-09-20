---
title: ADR-008: Jev call path: engine composes requests, Worker validates, meters, and forwards through the SDK
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

# ADR-008: Jev call path: engine composes requests, Worker validates, meters, and forwards through the SDK

**Date:** 2026-09-19

**Status:** Superseded by ADR-016 on 2026-09-19

## Context

The engine knows which mice need decisions and how to bucket their state into words (PRD section 5). The key must never reach the browser (SM-10). Requests must be batched by 16-by-16 tile up to 8 mice.

## Decision

The engine builds a complete System One request (state keyed per mouse, questions referencing those keys) in the worker thread and posts it to POST /api/jev. The Worker validates the payload with zod against the contract (allowed question ids, option sets, size limits), checks the session and quota, calls TypeSafeClient.systemOne, records usage, and returns answers, usage, and model unchanged. A 2,000 ms client-side timeout or any error yields a baseline decision for that batch and a decision-fallback event.

## Rationale

Keeps decision composition next to the state it describes and keeps the Worker thin and auditable: it never invents questions, it only enforces shape, identity, and budget. Returning the response unchanged is what lets the inspector show exactly what Jev said.

## Consequences

Easier: inspector fidelity, replay from logged responses, contract tests on the engine. Harder: the Worker must know the contract's allowed shapes to validate them, so the contract types are shared from the engine package.

## Alternatives Considered

Worker composes requests from raw engine state (rejected: doubles the state model server-side). Browser calls TypeSafe directly (rejected: exposes the key).
