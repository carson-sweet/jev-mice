---
id: ISSUE-007
title: "WP-7 quotas and anonymous abuse"
type: story
status: done
priority: P1
effort: m
epic: null
sprint: null
origin: manual
prs: []
created: 2026-09-19
validation_findings: ['H-4', 'H-5']
blocked_by: "D-1"
---

# ISSUE-007: WP-7 — quotas and anonymous abuse

## What

Reservation consults every applicable subject and denies on first refusal, giving the per-address budget an enforcement path. Bind anonymous quota primarily to the address; record the address hash on the run so the one-active-run rule survives a cookie reset.

## Findings addressed

H-4, H-5

## Documents touched

interface design 9.4/10, data model 3.2/6.2, FR-118, architecture 8

## Blocked by

D-1

## Resolution

2026-09-19. Applied in the document revisions committed with the remediation: requirements v3.1, architecture v2.2, data model v1.1, interface design v1.1, technical specification v1.1, user flows v1.1, decision records ADR-021 to ADR-024, and six amended records. Verified by the re-validation pass.
