---
id: ISSUE-004
title: "WP-4 bounded memory"
type: story
status: done
priority: P0
effort: l
epic: null
sprint: null
origin: manual
prs: []
created: 2026-09-19
validation_findings: ['B-6']
blocked_by: ""
---

# ISSUE-004: WP-4 — bounded memory

## What

Split the summary series into per-chunk segments stitched by the reader; remove the whole-series tail from the snapshot; rewrite both metric functions as streaming reducers over a chunk iterator; define the record type as a lazy stream.

## Findings addressed

B-6

## Documents touched

data model 7.3/7.4, FR-100/101, NFR-011, tech spec 7.2, interface design 5

## Blocked by

nothing — can start immediately

## Resolution

2026-09-19. Applied in the document revisions committed with the remediation: requirements v3.1, architecture v2.2, data model v1.1, interface design v1.1, technical specification v1.1, user flows v1.1, decision records ADR-021 to ADR-024, and six amended records. Verified by the re-validation pass.
