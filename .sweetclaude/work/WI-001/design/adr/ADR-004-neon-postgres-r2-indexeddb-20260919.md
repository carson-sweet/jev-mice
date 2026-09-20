---
title: ADR-004: Neon Postgres with the serverless driver and Drizzle for relational state; R2 for gzipped run records; IndexedDB as local cache
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

# ADR-004: Neon Postgres with the serverless driver and Drizzle for relational state; R2 for gzipped run records; IndexedDB as local cache

**Date:** 2026-09-19

**Status:** Superseded by ADR-014 on 2026-09-19

## Context

Run records are tens of megabytes of JSON uncompressed and must belong to users, follow them across devices, and be shareable. Users, sessions metadata, share tokens, and usage need indexed queries.

## Decision

Postgres on Neon, accessed from the Worker through the Neon serverless driver over HTTP, with Drizzle ORM for the schema and migrations. Tables: users, runs, share_tokens, jev_usage, quota_overrides. Each run's full event stream is gzipped in the browser with CompressionStream and stored as one object in R2 keyed by run id; Postgres holds the run's configuration, seed, summary, and blob key. The browser keeps an IndexedDB copy of runs it produced so live view and replay never wait on the network.

## Rationale

Records compress roughly ten to one and belong in object storage; relational rows stay small and fast. The Neon serverless driver is built for Workers. Drizzle gives a typed schema and migrations without a heavy runtime.

## Consequences

Easier: cheap storage at scale, small database, comparison view fetches two blobs. Harder: two storage services to configure; blob reads stream through the Worker.

## Alternatives Considered

Postgres only with compressed bytes in a column (rejected: multi-megabyte rows). Object storage only (rejected: rebuilds a database badly). Browser-local only (rejected: conflicts with accounts and share links).
