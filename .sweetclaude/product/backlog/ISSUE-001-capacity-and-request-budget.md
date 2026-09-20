---
id: ISSUE-001
title: "WP-1 capacity and request budget"
type: story
status: new
priority: P0
effort: l
epic: null
sprint: null
origin: manual
prs: []
created: 2026-09-19
validation_findings: ['B-1', 'FR-073']
blocked_by: "D-1"
---

# ISSUE-001: WP-1 — capacity and request budget

## What

Replace tile-bounded batching with a deterministic spatial sort filled to eight; batch cats together. Extend GlobalLimits to lease request rate alongside the token allowance on the chunk acknowledgement. Restate NFR-001 as tiered. Correct the scaling arithmetic. Add the rate ceiling to settings. Show achieved tick rate in the meter.

## Findings addressed

B-1, FR-073

## Documents touched

tech spec 5.2/9, FR-073/074/086, NFR-001/008, SM-01, architecture 8, interface design 9.2/10

## Blocked by

D-1
