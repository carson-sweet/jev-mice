# Artifact Privacy Manifest

**Version:** 1.0

**Date:** 2026-09-19

Routing table lives in `artifact-privacy.yaml`. This file records the decisions and why.

| Category | Privacy | Base path | Rationale |
|---|---|---|---|
| product | private | `.sweetclaude/product` | Brief, PRD, personas, backlog, milestones are process artifacts. Matches the tree setup creates and the session-state default, so cache and views agree. |
| strategy | public | `strategy/` | Created at repo root by init. Competitive and messaging notes are fine to publish for a showcase project. |
| technical | private | `.sweetclaude/technical` | Architecture, tech spec, data model. Can be relocated to `docs/` later if the showcase wants them public. |
| design | private | `.sweetclaude/design` | UX flows and wireframes. Same relocation option as technical. |

Edit `artifact-privacy.yaml` to relocate a category. All planning skills read it before writing.
