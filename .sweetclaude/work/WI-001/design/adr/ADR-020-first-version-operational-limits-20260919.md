---
title: ADR-020: Operational limits for the first version: chunking, instance type, active runs, retention, database layout
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

# ADR-020: Operational limits for the first version: chunking, instance type, active runs, retention, database layout

**Date:** 2026-09-19

**Status:** Accepted

## Context

The architecture left six values as proposals. Carson resolved them one at a time.

## Decision

Chunks flush at 250 ticks or 8 MB uncompressed, whichever comes first. Every preset runs on the basic container type (1/4 vCPU, 1 GiB), configurable per preset. One active run per subject, 20 active containers globally, further starts queue with position shown; allowlisted owners bypass the per-subject limit only. Retention is 30 days for signed-in users' runs with owners exempt and a badge during the last 7 days, and 24 hours for anonymous runs, enforced by a daily cron sweep that removes chunks, snapshot, summary, share tokens, and rows together. Neon: a new project named jev-mice with main, staging, and dev branches, autoscaling from a quarter compute unit, us-east-1. All values are configuration.

## Rationale

Each value bounds a cost or a failure mode from day one and can be raised with a setting once real usage is visible.

## Consequences

Easier: known worst-case bill, bounded storage, isolated database. Harder: users who want to keep a run beyond 30 days must export it, so export is a first-version feature.

## Alternatives Considered

Alternatives considered per value are recorded in decision log entries 40 to 45.
