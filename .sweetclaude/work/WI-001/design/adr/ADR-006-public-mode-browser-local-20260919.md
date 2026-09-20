---
title: ADR-006: Public mode is browser-local: anonymous visitors get Jev with quotas but no server storage
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

# ADR-006: Public mode is browser-local: anonymous visitors get Jev with quotas but no server storage

**Date:** 2026-09-19

**Status:** Superseded by ADR-015 on 2026-09-19

## Context

With AUTH_REQUIRED off, every visitor is anonymous and every Jev call bills Carson. Anonymous server storage is an abuse surface.

## Decision

In public mode, anonymous visitors run simulations with Jev under per-session and per-IP quotas, and all run records stay in their browser's IndexedDB. No anonymous run is stored server-side and share links require a signed-in owner. Local runs are uploaded to the account after a later sign-in if the user chooses.

## Rationale

Carson's choice over capped anonymous storage. It removes anonymous storage abuse entirely and keeps the personal data footprint to signed-in users only, at the cost of sharing in open-access mode.

## Consequences

Easier: no anonymous storage, retention, or cleanup. Harder: in open-access mode nobody can share a run, which weakens the public demo; the upload-after-sign-in path adds one flow.

## Alternatives Considered

Capped anonymous server storage with short retention (Claude's recommendation; declined). Global budget only (rejected: one visitor drains the day).
