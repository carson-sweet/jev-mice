---
id: ISSUE-008
title: "WP-8 sessions and deletion"
type: story
status: done
priority: P1
effort: m
epic: null
sprint: null
origin: manual
prs: []
created: 2026-09-19
validation_findings: ['H-6']
blocked_by: ""
---

# ISSUE-008: WP-8 — sessions and deletion

## What

Add a per-user session index so sign-out and account deletion revoke every session. Reject a session whose user row is gone. Resolve the fixed-versus-sliding session lifetime contradiction.

## Findings addressed

H-6

## Documents touched

data model 5/9, interface design 7, FR-078/132

## Blocked by

nothing — can start immediately

## Resolution

2026-09-19. Applied in the document revisions committed with the remediation: requirements v3.1, architecture v2.2, data model v1.1, interface design v1.1, technical specification v1.1, user flows v1.1, decision records ADR-021 to ADR-024, and six amended records. Verified by the re-validation pass.
