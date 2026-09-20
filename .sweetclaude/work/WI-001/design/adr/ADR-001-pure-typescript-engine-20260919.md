---
title: ADR-001: Pure TypeScript engine with a seeded generator and no platform dependencies
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

# ADR-001: Pure TypeScript engine with a seeded generator and no platform dependencies

**Date:** 2026-09-19

**Status:** Accepted

## Context

The requirements demand byte-for-byte replay from a stored record (NFR-004), a headless engine for tests and baseline runs (NFR-010), and one engine serving live runs, replay, and comparison.

## Decision

The simulation engine is a standalone TypeScript package with no dependency on the DOM, the network, timers, or the host runtime. All randomness flows through one injected pseudorandom generator (xoshiro128**) seeded from the run seed. Decisions come from an injected provider interface so the same engine runs against Jev, the baseline rules, or a stored record.

## Rationale

Determinism is a property of the boundary, not of discipline: if the engine cannot import a clock or a socket, it cannot become nondeterministic by accident. The provider interface is the only seam where the outside world enters, and it is what makes replay identical to a live run.

## Consequences

Easier: testing, replay, running under Node, moving the engine to a worker thread. Harder: anything that wants wall-clock time or direct I/O inside the engine has to be modeled as an event or an injected provider.

## Correction, 2026-09-19

This record's rationale predates ADR-013 and argues against server-side execution on the grounds that the browser simulates for free. That argument no longer holds and the alternatives below should be read as history. The decision itself, a platform-free engine with injected providers, is unchanged and is what made moving the engine to the server cheap.

## Alternatives Considered

Engine coupled to the browser (rejected: untestable headless, replay would diverge). Engine on the server per user (rejected: server compute per tenant for a workload the browser does for free).
