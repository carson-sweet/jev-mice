---
title: ADR-022: The coordinator mints presigned object URLs; containers hold no storage credential
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

# ADR-022: The coordinator mints presigned object URLs; containers hold no storage credential

**Date:** 2026-09-19

**Status:** Accepted

## Context

Validation found three blocking defects on one boundary. A container with write-only credentials could not read the snapshot resume requires. Nothing validated the object keys a container reported, so a buggy or subverted container could point a run's chunk row at another run's object and the read route would serve it, because it authorizes the caller against the run rather than the object. And object-store tokens scope to a bucket, not a key prefix, so the claimed per-run isolation did not exist and any container could overwrite any other run's summary and snapshot.

## Decision

The container holds no storage credential. The Run object chooses every object key and hands the container a presigned PUT for each one it should write, and a presigned GET for the snapshot when starting a resume. The chunk report carries sizes and counts but no keys, because the coordinator already knows them. Presigned URLs are short-lived and single-object. The callback token is rotated on every container start, so a container the watchdog declared dead cannot report into its replacement's run. Supersedes the storage-path portions of ADR-013, ADR-014 and ADR-019.

## Rationale

One change removes all three defects rather than patching each. A container that cannot name a key cannot name someone else's, so the validation check becomes unnecessary rather than merely specified. A URL good for one object is the prefix scoping the credential model could not express. And the read needed for resume is granted without granting read to anything else.

## Consequences

Easier: the trust boundary is enforced by what the container is given rather than by what it is trusted not to do. Harder: the coordinator mints three URLs per chunk boundary, and their lifetime has to exceed a slow upload.

## Alternatives Considered

Validate the reported key prefix and keep credentials (rejected: leaves bucket-wide write and does not solve the resume read). Route object bytes through the coordinator (rejected: pushes megabytes through a 128 MB isolate).
