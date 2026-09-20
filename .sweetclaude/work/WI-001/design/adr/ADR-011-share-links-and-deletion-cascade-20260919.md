---
title: ADR-011: Share links as unguessable revocable tokens; account deletion cascades
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

# ADR-011: Share links as unguessable revocable tokens; account deletion cascades

**Date:** 2026-09-19

**Status:** Accepted

## Context

Carson chose per-user isolation plus public share links. Personal data is present, so deletion must be complete.

## Decision

A share token is 128 bits of randomness, base64url-encoded, stored in share_tokens with the run id and a revoked_at timestamp. GET /api/share/:token serves the run's metadata and blob to anyone holding a live token, read-only. Deleting a run or an account revokes its tokens and removes its blobs, rows, and usage; a shared link to a deleted run returns not found. Account export returns the user's rows and a list of their run ids and blob sizes.

## Rationale

Unguessable tokens are the standard for link sharing without accounts on the viewer's side. Cascading deletion is the simplest honest answer to 'what happens to my shared runs when I leave'.

## Consequences

Easier: sharing without viewer accounts, clean deletion. Harder: a shared link can die when the owner deletes; the share page must say so plainly.

## Correction, 2026-09-19

Written before chunking and before token hashing. A share route serves a run's chunks and summary segments, not a single blob; only a hash of a token is stored, per the data model; and account export lists run identifiers and sizes rather than blob sizes.

## Alternatives Considered

Public runs by user id (rejected: guessable). Retain shared runs anonymized after deletion (rejected: complicates deletion semantics for little gain).
