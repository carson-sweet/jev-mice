---
title: ADR-018: Repository as npm workspaces with four packages: engine, web, worker, sim
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

# ADR-018: Repository as npm workspaces with four packages: engine, web, worker, sim

**Date:** 2026-09-19

**Status:** Accepted

## Context

ADR-010 defined three packages. Server-side execution adds a Node container image.

## Decision

packages/engine (pure TypeScript, ADR-001); apps/web (React viewer); apps/worker (Hono API, Run Durable Object, QuotaCounter and GlobalBudget Durable Objects, Container binding, Drizzle schema); apps/sim (Node process for the container image: loads the engine, runs the loop, talks to its Run Durable Object, calls TypeSafe). The engine exports contract, event, chunk, summary, and record types; web, worker, and sim import them. Nothing imports into engine. Supersedes ADR-010.

## Rationale

Four packages for four runtimes: browser, Workers, container, and the platform-free engine they share.

## Consequences

Easier: each runtime's dependencies stay separate, the container image contains only engine and sim. Harder: one more package and a Dockerfile.

## Alternatives Considered

Sim code inside the worker package (rejected: Workers runtime and Node runtime have different dependency sets).
