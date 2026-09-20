---
title: ADR-015: Public mode runs server-side with 24-hour anonymous retention and no sharing
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

# ADR-015: Public mode runs server-side with 24-hour anonymous retention and no sharing

**Date:** 2026-09-19

**Status:** Accepted

## Context

With authentication off, anonymous visitors still need Jev-driven runs, but ADR-006's browser-local storage assumed the browser produced the record. It now comes from the server.

## Decision

Anonymous visitors start runs exactly as users do, under anonymous quotas keyed by a signed cookie and by address. Their run rows, chunks, and summaries are retained server-side for 24 hours so a dropped connection can resume, then deleted by the retention sweep. Anonymous runs cannot be shared and do not appear in any library beyond the visitor's own cookie. The browser may mirror chunks into IndexedDB as they arrive so the visitor keeps a copy past the 24 hours. Supersedes ADR-006.

## Rationale

Keeps Carson's intent that public mode stores as little as possible about anonymous visitors, adapted to server-side execution: the minimum that lets a run survive a reconnect.

## Consequences

Easier: no anonymous library, no anonymous sharing, small anonymous footprint. Harder: a retention sweep must exist from the first release.

## Correction, 2026-09-19

The clause permitting the browser to mirror chunks into local storage is withdrawn. No other document implements it, the flows contradict it, and NFR-007 bars depending on local storage for correctness. An anonymous run is gone when its retention expires.

## Alternatives Considered

Keep anonymous records indefinitely (rejected: storage abuse). Stream to the browser and store nothing (rejected: a dropped connection loses the run).
