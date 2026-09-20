---
title: ADR-012: Vitest for engine and Worker tests, with determinism and replay tests as the core suite
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

# ADR-012: Vitest for engine and Worker tests, with determinism and replay tests as the core suite

**Date:** 2026-09-19

**Status:** Accepted

## Context

Reproducibility (NFR-004), the flee-or-hide metric (SM-07), and the personality-mix metric (SM-06) must be computed from records in tests. Vite is the bundler.

## Decision

Vitest runs the engine suite headless under Node and the Worker suite against the Cloudflare Vite plugin's local runtime. The core engine tests are: same seed and provider yields identical event streams; replaying a record yields the identical stream with zero provider calls; baseline and Jev runs on one seed diverge only at decision events; and the SM-06 and SM-07 metrics computed from fixture records match expected values.

## Rationale

One test runner for the whole workspace, native to the bundler, with browser mode available later for the React app.

## Consequences

Easier: one command runs everything. Harder: Durable Object tests need the local runtime, which the plugin provides.

## Alternatives Considered

node:test as in Brogue (rejected: no Vite integration). Jest (rejected: slower, extra transform config).
