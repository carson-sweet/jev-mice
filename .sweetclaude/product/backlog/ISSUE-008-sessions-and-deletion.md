---
id: ISSUE-008
title: "WP-8 sessions and deletion"
type: story
status: new
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
