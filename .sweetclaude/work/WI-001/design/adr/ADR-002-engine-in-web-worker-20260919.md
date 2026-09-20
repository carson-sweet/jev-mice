---
title: ADR-002: Simulation executes in the browser inside a dedicated Web Worker
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

# ADR-002: Simulation executes in the browser inside a dedicated Web Worker

**Date:** 2026-09-19

**Status:** Superseded by ADR-013 on 2026-09-19

## Context

Baseline mode must sustain 30 or more ticks per second (NFR-001) while logging tens of thousands of events, the canvas must hold 30 frames per second (NFR-002), and replay wants to run ahead of the display.

## Decision

The engine runs in a dedicated Web Worker owned by the browser app. The worker owns the tick loop, the event log, IndexedDB writes, and calls to the Jev API; it posts compact frame snapshots and per-tick chart series to the main thread, and answers inspector requests for decision detail on demand. The main thread only renders.

## Rationale

The engine has no DOM dependency by ADR-001, so it drops into a worker unchanged. Keeping the render thread free of the tick loop is the only way to meet the tick-rate and frame-rate requirements together. One message protocol serves live runs, replay, and tests.

## Consequences

Easier: responsiveness at any tick rate, isolation enforced by the thread boundary. Harder: a message protocol to design, and debugging across the boundary.

## Alternatives Considered

Main thread with frame budgeting (rejected: 30 ticks per second plus event logging janks the inspector and charts). Worker for live, main thread for replay (rejected: two execution paths for one engine).
