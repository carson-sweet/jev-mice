---
title: jev-mice Solution Validation Report
version: 1.1
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: re-validation after the remediation. Verdict changes from does not pass to passes.
previous_file: jev-mice-solution-validation-v1.0-20260919.md
---

# jev-mice Solution Validation Report

**Version:** 1.1

**Date:** 2026-09-19

**Work item:** WI-001

**Verdict: PASSES.** All seven blocking findings are closed, as are the sixteen high findings and the medium and low set. Implementation is authorized.

## What changed

Four decisions were taken and eleven work packages applied, producing requirements v3.1, architecture v2.2, data model v1.1, interface design v1.1, technical specification v1.1, user flows v1.1, four new decision records and six amended ones.

## The blocking findings, and how each is closed

**B-1, capacity.** Batching now orders decision-ready mice by a deterministic spatial sort and fills groups of eight rather than confining a group to a tile, which takes measured traffic from 6.76 requests per tick to 1.74. The limits object leases a share of one deployment-wide request budget alongside the token allowance at every chunk boundary, which is also what gives FR-073 a mechanism. Throughput is stated as tiered rather than flat: two ticks per second to five concurrent runs, degrading predictably to about half a tick per second at twenty. The scaling section carries the corrected arithmetic and the measured curve.

**B-2, resume could not read its snapshot.** The coordinator presigns a single-object read of the snapshot when it starts a replacement. No credential is granted and nothing else becomes readable.

**B-3, unvalidated object keys.** The coordinator chooses every key and presigns each upload, so a container cannot name a key at all. The defect is removed rather than checked for.

**B-4, credential scope.** A container holds no object-store credential. Each presigned URL is good for one object and a short window, which is the prefix scoping the credential model could not express.

**B-5, viewer state.** The container exposes a world-state endpoint and the coordinator keeps its last broadcast frame, answering a connecting viewer from the frame when it is under a second old and from the container otherwise. Stored data is never used, because it lags by up to a chunk.

**B-6, bounded memory.** The summary is written as one immutable segment per chunk instead of a whole-run object rewritten at every boundary, and a snapshot carries only the current segment. Both behavioural metrics are streaming reducers over a chunk iterator, so the analysis views are bounded too.

**B-7, fear had no effect.** The fear factor divides distance inside the danger formula rather than scaling its result, because a scale applied to every candidate cell is cancelled by the normalization that follows. A test asserts the normalized gradient differs between fear levels.

## The high findings

All sixteen are closed. The control vocabulary carries step and is pushed immediately rather than waiting up to two minutes for a boundary. Quota reservation consults every applicable subject and stops at the first refusal, and an anonymous budget is keyed to the address so clearing a cookie no longer resets it. A per-account session index makes sign-out and deletion able to revoke sessions on other devices. The socket upgrade checks its origin. Four success metrics that could not measure what they claimed now can: spawn events record the starting cohort, the decision source is inside what the comparison diffs, the flee-or-hide check is qualified to the band that can produce a decision event and carries a sample guard, and stream comparison excludes wall-clock fields by a declared list. Browser error reporting moved behind a first-party endpoint, so the no-third-party rule stays true as written. The address hash is named as personal data and rotated daily.

## Verification

Twenty-two automated checks over the six revised documents, one per blocking and high finding, each asserting both that the correction is present and that the defective text is gone. All pass. Requirement numbering is intact at 146 with no duplicates, no gaps and no dangling citations in any document.

## What remains

Nine open questions across the documents, each carrying a proposal and none blocking. Two new assumptions are registered and worth measuring early: that spatial-sort batching does not degrade decision quality, and that the United States scoping remains an accepted risk rather than a control.
