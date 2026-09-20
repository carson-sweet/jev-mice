---
title: ADR-024: The summary series is stored as per-chunk segments
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

# ADR-024: The summary series is stored as per-chunk segments

**Date:** 2026-09-19

**Status:** Accepted

## Context

NFR-011 and FR-101 require that no process hold more than one chunk and that memory not grow with a run's length. The snapshot type carried the whole summary series from tick zero, so a container had to hold every tick's summary for the life of the run and re-serialize all of it at every boundary: memory linear in ticks, bytes written quadratic.

## Decision

The summary is written as one segment per chunk, covering the same tick range, and stitched by whatever reads it. A snapshot carries only the current segment. Readers that need the whole series, the charts and the comparison view, fetch segments and concatenate; a segment is small enough that a long run's full series is still one modest download. Supersedes the single-summary-object portion of ADR-014.

## Rationale

Makes the bounded-memory guarantee true by construction rather than by discipline, and turns quadratic writes into linear ones.

## Consequences

Easier: memory is flat, writes are linear, a partial run is readable. Harder: readers concatenate rather than fetch one object.

## Alternatives Considered

Keep one rewritten object (rejected: the defect). Append-only storage (rejected: the object store does not append).
