---
id: ISSUE-003
title: "WP-3 viewer state source"
type: story
status: done
priority: P0
effort: m
epic: null
sprint: null
origin: manual
prs: []
created: 2026-09-19
validation_findings: ['B-5']
blocked_by: ""
---

# ISSUE-003: WP-3 — viewer state source

## What

Add a world-state endpoint to the container protocol; the coordinator caches the most recent broadcast frame and serves it to a connecting viewer when fresh, fetching otherwise.

## Findings addressed

B-5

## Documents touched

interface design 8/9.3, data model 6.1, architecture 5, NFR-014

## Blocked by

nothing — can start immediately

## Resolution

2026-09-19. Applied in the document revisions committed with the remediation: requirements v3.1, architecture v2.2, data model v1.1, interface design v1.1, technical specification v1.1, user flows v1.1, decision records ADR-021 to ADR-024, and six amended records. Verified by the re-validation pass.
