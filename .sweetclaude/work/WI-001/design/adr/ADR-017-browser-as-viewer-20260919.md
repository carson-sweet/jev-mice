---
title: ADR-017: Browser is a viewer: React renders frames and summary series, holds no engine
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

# ADR-017: Browser is a viewer: React renders frames and summary series, holds no engine

**Date:** 2026-09-19

**Status:** Accepted

## Context

ADR-009 chose Vite, React, Tailwind, uPlot, and a canvas grid, and hosted the engine in a Web Worker. The engine has moved server-side.

## Decision

The frontend stack stands: Vite with the Cloudflare Vite plugin, React 19, Tailwind 4, uPlot, imperative canvas. The browser opens a WebSocket to the run's stream route, receives a snapshot then frame deltas at display rate, and draws them. Charts read the summary series. The inspector requests decision detail for one animal by id: live, the Run Durable Object forwards to the container; in replay, the browser reads it from the chunk in view. Controls (pause, resume, step, speed, stop) are messages to the Durable Object. There is no Web Worker and no engine code in the bundle. Supersedes ADR-009.

## Rationale

Same stack, smaller bundle, and the browser's only hard job is drawing.

## Consequences

Easier: memory, bundle size, mobile viability later. Harder: a WebSocket protocol and reconnect logic.

## Alternatives Considered

Keep a browser engine for replay only (rejected: two engines, two behaviors).
