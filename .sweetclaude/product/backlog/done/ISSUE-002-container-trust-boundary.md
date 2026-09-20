---
id: ISSUE-002
title: "WP-2 container trust boundary"
type: story
status: done
priority: P0
effort: m
epic: null
sprint: null
origin: manual
prs: []
created: 2026-09-19
validation_findings: ['B-2', 'B-3', 'B-4', 'H-3']
blocked_by: ""
---

# ISSUE-002: WP-2 — container trust boundary

## What

Coordinator mints presigned URLs per object; the container holds no storage credential and cannot name a key. Presigned GET for the snapshot unblocks resume. Rotate the callback token on every restart. Settle who writes to storage in the architecture and in ADR-013/014/019.

## Findings addressed

B-2, B-3, B-4, H-3

## Documents touched

interface design 9.1/9.2/9.3, architecture 5/6, ADR-013/014/019, data model 4, tech spec 10

## Blocked by

nothing — can start immediately

## Resolution

2026-09-19. Applied in the document revisions committed with the remediation: requirements v3.1, architecture v2.2, data model v1.1, interface design v1.1, technical specification v1.1, user flows v1.1, decision records ADR-021 to ADR-024, and six amended records. Verified by the re-validation pass.
