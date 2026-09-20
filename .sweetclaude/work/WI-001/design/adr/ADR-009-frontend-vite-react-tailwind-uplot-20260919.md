---
title: ADR-009: Frontend stack: Vite, React 19, Tailwind 4, the Cloudflare Vite plugin, uPlot charts, and an imperative canvas grid
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

# ADR-009: Frontend stack: Vite, React 19, Tailwind 4, the Cloudflare Vite plugin, uPlot charts, and an imperative canvas grid

**Date:** 2026-09-19

**Status:** Superseded by ADR-017 on 2026-09-19

## Context

The app has sign-in, configuration, live view with inspector, charts, run library, comparison, replay, share, and account screens. Six time-series charts update up to 30 times a second.

## Decision

Vite with the Cloudflare Vite plugin builds the React 19 app and runs the Worker locally in one command. Tailwind 4 for styling. The grid is drawn on a canvas from worker frames. Charts use uPlot behind a thin React component. React state never sits in the per-tick path; frames and chart series arrive from the worker and are drawn imperatively.

## Rationale

Matches Carson's existing sandbox stack, is the most legible choice for evaluators reading the repo, and the Cloudflare plugin gives the whole stack one dev command. uPlot is the fastest option by a wide margin for many points updating often and covers every chart type needed.

## Consequences

Easier: forms, routing, panels, local development. Harder: discipline to keep React out of the render loop; uPlot's imperative API needs a wrapper.

## Alternatives Considered

Preact (rejected: compat friction). Svelte 5 (rejected: second framework). Vanilla TypeScript (rejected: eight views hand-rolled). Chart.js, Recharts, D3 (rejected on update-rate performance or code volume).
