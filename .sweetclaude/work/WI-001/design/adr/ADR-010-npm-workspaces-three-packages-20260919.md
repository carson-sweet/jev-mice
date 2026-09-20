---
title: ADR-010: Repository as npm workspaces with three packages: engine, web, worker
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

# ADR-010: Repository as npm workspaces with three packages: engine, web, worker

**Date:** 2026-09-19

**Status:** Superseded by ADR-018 on 2026-09-19

## Context

The engine must be shared by the browser worker thread and the API (for contract types), tested headless, and kept free of platform code.

## Decision

One repository with npm workspaces: packages/engine (pure TypeScript, ADR-001), apps/web (Vite React app including the simulation worker thread), apps/worker (Hono on Cloudflare Workers, Drizzle schema, Durable Objects). The engine exports the decision contract types and the event and record types; web and worker import them. Nothing imports from web or worker into engine.

## Rationale

Three packages match the three runtimes (browser main thread, browser worker thread, Cloudflare Worker) and make the engine's isolation a dependency rule the build enforces.

## Consequences

Easier: engine tests without a browser, contract types shared without duplication. Harder: workspace tooling and one more package.json to maintain.

## Alternatives Considered

Single package with folders (rejected: isolation by convention only). Separate repositories (rejected: contract drift).
