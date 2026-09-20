---
title: ADR-014: Run records as gzipped tick-range chunks in R2 with a compact summary series; nothing buffered in memory
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

# ADR-014: Run records as gzipped tick-range chunks in R2 with a compact summary series; nothing buffered in memory

**Date:** 2026-09-19

**Status:** Accepted. Partially superseded on 2026-09-19: the storage path by ADR-022, the single summary object by ADR-024.

## Context

A run record can reach hundreds of megabytes. Neither the engine host, the Durable Object, nor the browser may hold it whole. Replay must scrub a 20,000-tick run, and comparison must overlay two runs, without loading them entirely.

## Decision

The engine emits events into a chunk buffer of a fixed tick range (250 ticks proposed). At each boundary the container gzips the chunk and posts it to the Run Durable Object, which writes it to R2 under runs/{id}/chunks/{n}.json.gz and records tick range, byte size, and event count in run_chunks. Alongside, the container maintains a compact per-tick summary series (population by sex and personality, mice in holes, deaths by cause, mean nutrition, mean fear, decisions, tokens, cost) written as one gzipped object runs/{id}/summary.json.gz at every chunk boundary; Postgres holds scalar totals for listing. Replay fetches chunks by tick range through an authorized Worker route and decompresses in the browser. Comparison reads two summary objects. Supersedes the IndexedDB-cache portion of ADR-004; Neon for relational state and R2 for blobs stand.

## Rationale

Bounded memory everywhere by construction. A chunk is a few hundred kilobytes gzipped; a summary is under a megabyte for the longest run. Scrubbing loads one chunk at a time.

## Consequences

Easier: memory safety, resumable writes, partial reads. Harder: a chunk index to maintain and a replay client that pages.

## Alternatives Considered

Single record object (rejected: must be held whole to write or read). Events in Postgres rows (rejected: tens of thousands of rows per run on the hot path). IndexedDB in the browser (rejected: the browser no longer produces the record).
