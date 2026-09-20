# Scope Changes

| # | Date | Change | Reason | Impact |
|---|---|---|---|---|
| 1 | 2026-09-19 | Hosted multi-tenant web app with Google sign-in behind an auth-required feature flag, switchable to open public access (was: one person, one browser, locally run) | Carson's direction at the architecture deployment question | Reverses three out-of-scope items (single user, server-side store, browser-only storage). Adds accounts, server run library, quotas and budgets, public mode, account deletion and export, feature flags. Compliance context now records personal data. Requires PRD v3.0 and brief v2.0. |
| 2 | 2026-09-19 | Per-run public share links | Carson's tenancy choice | New requirement group; share tokens table; deletion cascades break shared links by design. |
| 3 | 2026-09-19 | Public mode stores nothing server-side for anonymous visitors | Carson's choice over capped anonymous storage | Share links require sign-in; anonymous runs live in the visitor's browser; upload-after-sign-in flow added. |
| 4 | 2026-09-19 | Requirements v3.0 and brief v2.0 absorb the hosted multi-tenant change: 12 requirements revised or withdrawn, 10 new requirement groups, 67 new requirements, 8 new success metrics, 5 new non-functional requirements, 4 new epics | Closing the gap opened when the deployment answer reversed three out-of-scope items during architecture | The requirements baseline and the definition of done now match the design. Traceability map populated with epic to requirement to metric mapping. |
