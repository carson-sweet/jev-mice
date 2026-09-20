---
title: ADR-013: Engine executes server-side in a Cloudflare Container per run, orchestrated by a Run Durable Object
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

# ADR-013: Engine executes server-side in a Cloudflare Container per run, orchestrated by a Run Durable Object

**Date:** 2026-09-19

**Status:** Accepted. Storage path partially superseded by ADR-022 on 2026-09-19: the container no longer writes objects with its own credentials and no longer chooses keys. Superseded by ADR-025 on 2026-09-20: the engine runs inside the Run Durable Object, advancing a batch of ticks per alarm, and no container is built. The memory objection recorded here was answered by draining events into chunks; the engine has no dependencies and runs on the Workers runtime unchanged.

## Context

Carson rejected browser-side simulation: a long Large run pushes hundreds of megabytes of events through a tab that also renders, and a closed tab kills the run. Plain Workers cap CPU at 5 minutes per invocation, isolates at 128 MB, and outgoing connections at 6, which shapes any engine hosted directly in a Durable Object. Cloudflare Containers are generally available on the paid plan with instance types from 256 MiB to 12 GiB.

## Decision

Each active run executes in its own Cloudflare Container running a plain Node process (apps/sim) that hosts the engine loop. A Run Durable Object per run owns the run's identity and status, its viewers' WebSockets, quota reservations, the chunk index, and control commands. The Worker starts a run by creating the run row and asking the Run Durable Object to start its container with the run configuration and secrets in the environment. The container reports frames, chunks, and usage to its Run Durable Object over HTTP; the Durable Object writes chunks to R2 and rows to Postgres and fans frames out to viewers. Runs continue with no viewer connected. The browser never simulates. Supersedes ADR-002.

## Rationale

Real memory and an unbounded loop per run, in a Node process that runs and debugs locally exactly as Brogue's server does, while staying on the platform Carson chose. Durable Objects are the natural owner of per-run coordination and WebSocket fan-out.

## Consequences

Easier: long runs, large presets, runs that outlive tabs, one engine on one runtime. Harder: a container image to build, a cold start of a few seconds per run, per-run compute cost while running, and a small HTTP protocol between container and Durable Object.

## Alternatives Considered

Durable Object hosts the engine (rejected: 128 MB shared isolate memory, 6 concurrent connections serialize Jev batches, subrequest cap forces alarm-chained chunks with snapshots). Node service on Fly.io (rejected: leaves the chosen platform). Browser Web Worker (rejected by Carson: crashes the browser on long runs).
