---
title: jev-mice Architecture
version: 1.0
status: deprecated
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: initial draft
previous_file: none
---

# jev-mice Architecture

**Version:** 1.0 (draft)

**Date:** 2026-09-19

**Work item:** WI-001

**Companions:** jev-mice Product Brief v1.3, jev-mice Product Requirements Document v2.1. This document changes the product's shape from a single-user local app to a hosted multi-tenant web app; section 9 lists what the brief and requirements must absorb.

## 1. Overview and guiding principles

[1] jev-mice is a hosted web application in which a browser runs an ecology simulation of mice, cats, traps, food, and mouseholes, with every animal's decisions arbitrated by Jev, TypeSafe's System One model. Users sign in with Google, keep a library of runs that follow them across devices, share runs by link, and compare runs side by side. An operator can switch authentication off for open public access, in which case visitors simulate with Jev under quotas and keep their runs in their own browser.

[2] **The simulation runs where the user is.** The engine executes in the visitor's browser, in a worker thread. The server never simulates; it authenticates, meters, proxies Jev, and stores.

[3] **Code owns the clear answers, Jev owns the tradeoffs.** Reflexes, arithmetic, pathing, timers, and persistence are code. Which drive wins, how afraid to be, which mate, whether a hole is safe: those are Jev's, asked in words and answered in probabilities.

[4] **Determinism is a boundary.** The engine cannot import a clock or a socket. Randomness and decisions enter through injected providers. A stored run replays to the byte with zero network calls.

[5] **Every Jev exchange is preserved verbatim.** The inspector shows exactly what was sent and exactly what came back, because the Worker forwards responses unchanged and the record stores them whole.

[6] **Cost is bounded from three directions.** Per subject, per address, and per deployment. Exhaustion degrades to baseline rules with a banner; it never breaks a run.

[7] **Personal data is minimal and deletable.** Google subject id, email, name, avatar. Nothing else about a person. Deletion cascades to every run, share, blob, and usage row.

## 2. Technology decisions

| Concern | Decision | Version at decision |
|---|---|---|
| Language | TypeScript throughout | 5.x |
| Engine | Standalone package, xoshiro128** seeded generator, provider interfaces | ADR-001 |
| Browser app | Vite, React, Tailwind, canvas grid, uPlot charts | React 19.3, Tailwind 4.3, uPlot 1.6.32, Vite plugin 1.56 |
| Simulation thread | Dedicated Web Worker | ADR-002 |
| Platform | Cloudflare Workers with static assets, Hono | Hono 4.13, wrangler 4.135 |
| Sign-in | Google via @hono/oauth-providers, KV sessions | oauth-providers 0.9 |
| Relational store | Neon Postgres 17 via @neondatabase/serverless, Drizzle ORM | driver 1.1, Drizzle 0.45 |
| Blob store | Cloudflare R2, gzipped run records | CompressionStream in browser |
| Counters | Durable Objects for quotas and global budget | ADR-007 |
| Local cache | IndexedDB via idb | idb 8.0 |
| Validation | zod at the API boundary | zod 4.6 |
| Jev client | @typesafe-ai/sdk in the Worker only | 0.6.0, MIT, fetch-based |
| Tests | Vitest | 5.0 |
| Repository | npm workspaces: packages/engine, apps/web, apps/worker | ADR-010 |

## 3. Architecture style and rationale

[8] A modular monolith with one deployable server unit and one browser bundle. The Worker is a single deployment that serves both the API and the static app; the browser bundle contains the React app and the simulation worker thread; the engine is a package both depend on. Three packages, three runtimes, one repository.

[9] Services were not considered seriously. The server has four jobs (authenticate, meter, proxy, store) that share one identity and one quota model; splitting them would add network hops to a hot path that already has a 2,000 millisecond budget. The seams that matter are inside the monolith: the engine's provider interface and the Worker's route boundaries.

## 4. Component diagram

```
Browser
  Main thread (React)                 Worker thread (engine host)
  +--------------------------+        +--------------------------------+
  | routes: sign-in, config, |        | packages/engine                |
  | live, inspector, runs,   | frames | world, clock, signals, agents, |
  | compare, share, account  |<-------| perception, memory, decisions, |
  | canvas grid, uPlot       | events | events, record, replay, rng    |
  | idb cache (read)         |------->| providers: Jev | Baseline |    |
  +--------------------------+ cmds   |            Replay              |
              |                       | idb cache (write), gzip        |
              | /api/*                +--------------------------------+
              v                                      | POST /api/jev
Cloudflare Worker (Hono)                             v
  +-------------------------------------------------------------------+
  | session middleware -> auth flag -> routes                         |
  | /api/auth/google  /api/me  /api/jev  /api/runs  /api/share        |
  | /api/account  /api/quota      static assets (SPA fallback)        |
  +-------------------------------------------------------------------+
     |            |              |                 |             |
     v            v              v                 v             v
  KV sessions  Durable Objects  R2 run records  Neon Postgres  TypeSafe API
               QuotaCounter*    gzipped JSON    users, runs,   systemOne
               GlobalBudget                     share_tokens,
                                                jev_usage
```

## 5. Data flow

[10] **Live run.** The user submits configuration. The main thread posts start(config, seed, mode) to the worker thread. The engine ticks, emits typed events, appends them to an IndexedDB record under the run id, and posts a frame snapshot (positions, states, tick, meter) and chart series to the main thread at the display rate, not the tick rate.

[11] **Jev decision.** Each tick the engine collects decision-ready mice, groups them by 16-by-16 tile up to eight, builds one System One request per group with state keyed per mouse, and calls the Jev provider. The provider posts to /api/jev with the session cookie. The Worker validates the payload against the shared contract, resolves the subject, reserves the estimated tokens against the subject's QuotaCounter and the GlobalBudget, calls the SDK, commits actual usage from the response, writes a jev_usage row, and returns answers, usage, and model unchanged. The engine applies the answers per the contract. A 2,000 millisecond timeout, an error, or a jev_unavailable response yields baseline decisions for that batch and a decision-fallback event.

[12] **Run end.** The worker thread finalizes the record, gzips it with CompressionStream, and stores it in IndexedDB. If the session is a signed-in user, it posts metadata to /api/runs and streams the blob to the returned upload route; the Worker writes the object to R2 and marks the run stored. Anonymous sessions stop at IndexedDB.

[13] **Replay and comparison.** The app loads a record from IndexedDB or from /api/runs/:id (owner) or /api/share/:token (anyone with the link), hands it to the worker thread with the Replay provider, and scrubs. Comparison loads two records, diffs their configurations, and overlays their series.

[14] **Sign-in.** GET /api/auth/google runs the OAuth dance; on callback the Worker upserts the user, creates a KV session, sets the cookie, and redirects to the app. GET /api/me returns the session's user or anonymous status plus remaining quota. Sign-out deletes the KV entry and clears the cookie.

[15] **Public mode.** With AUTH_REQUIRED false, the session middleware issues a signed anonymous cookie to visitors without one. Anonymous subjects can call /api/jev under anonymous quotas and cannot call /api/runs or /api/share for writes. After a later sign-in, the app offers to upload runs held locally.

[16] **Account deletion.** DELETE /api/account revokes share tokens, deletes R2 objects, deletes runs and usage rows, deletes the user, deletes the KV session, and clears the cookie, in that order, and returns a summary of what was removed.

## 6. Compliance and security requirements

[17] Personal data is present: Google subject id, email address, display name, and avatar URL of each signed-in user. Carson has scoped users to the United States, so under the framework's rules only the data-minimization baseline applies. The items below marked HARD REQUIREMENT are non-negotiable regardless; the rest are recommended design that keeps the deployment safe to leave in public mode.

[18] **HARD REQUIREMENT. Minimal scopes and fields.** Request only openid, email, and profile. Store only subject id, email, name, and avatar URL. No other personal attribute is collected or derived.

[19] **HARD REQUIREMENT. No analytics or tracking.** No third-party scripts, pixels, or fingerprinting. Telemetry describes simulated animals and the user's own Jev usage. This carries NFR-006 forward with its wording corrected for the presence of accounts.

[20] **HARD REQUIREMENT. Secrets stay server-side.** TYPESAFE_API_KEY, GOOGLE_SECRET, NEON_DATABASE_URL, and SESSION_SIGNING_KEY exist only as Worker secrets. The built bundle and every proxy response contain no key material (SM-10).

[21] **HARD REQUIREMENT. Session and cookie hygiene.** Session tokens are 256 random bits, stored in KV with a 30-day expiry, delivered in HttpOnly, Secure, SameSite=Lax cookies. OAuth state is handled by the middleware. Anonymous cookies are HMAC-signed with SESSION_SIGNING_KEY.

[22] **HARD REQUIREMENT. Authorization on every run route.** Every /api/runs route checks that the run's owner is the session's user. Share routes authorize by token only and are read-only.

[23] **HARD REQUIREMENT. Payload validation.** /api/jev accepts only requests matching the shared contract's question ids, option sets, and size limits, so the proxy cannot be used as a general TypeSafe relay.

[24] **Recommended.** Account deletion that cascades (ADR-011). Account export. A privacy notice on the sign-in screen stating what is stored and for how long. A retention default for signed-in runs (90 days, owner exempt) enforced by a daily cron trigger, configurable.

## 7. Boundary design

[25] **packages/engine.** Owns the world, clock, signal fields, mice, cats, food, traps, mouseholes, perception, memory, reproduction, personality, the decision contract (request composition, answer application, baseline substitution, bucketing of numbers into words), the typed event union, the run record format, replay, the seeded generator, and configuration validation including grid caps. Exposes createEngine(config, seed, providers), step(), subscribe(), snapshot(), and the contract, event, and record types. Imports nothing from the other packages and nothing platform-specific.

[26] **apps/web.** Owns routing and screens, the canvas renderer, chart components, the IndexedDB cache, the API client, and the simulation worker thread that hosts the engine and implements the Jev, Baseline, and Replay providers. The worker thread is the only place in the browser that instantiates the engine.

[27] **apps/worker.** Owns the Hono app, session and auth-flag middleware, routes, the zod contract validator, the Drizzle schema and migrations, the two Durable Object classes, R2 access, and the TypeSafe SDK client. Imports contract, event, and record types from the engine and nothing else from it.

[28] **Seams.** The engine's provider interface is where the engine could be driven by a different model or a different transport without change. The Worker's route layer is where storage could move (another Postgres, another bucket) without touching the app. The worker-thread message protocol is where the engine could move server-side in some future version without changing the React app.

[29] **What must not bleed.** No DOM, fetch, Date, or Math.random inside the engine. No simulation logic in the Worker. No React state on the per-tick path. No personal data in run records or telemetry beyond the owning user id in the database row.

## 8. Operational model

[30] **Feature flags and limits** are Worker variables: AUTH_REQUIRED, JEV_ENABLED, OWNER_EMAILS, ANON_DAILY_TOKENS, USER_DAILY_TOKENS, IP_DAILY_TOKENS, GLOBAL_DAILY_COST_MICROS, JEV_PRICE_PER_MTOK_MICROS, RUN_RETENTION_DAYS, MAX_BLOB_BYTES. Changing a flag is a redeploy or a dashboard edit, not a code change.

[31] **Environments.** Local development runs the real Workers runtime with local KV, R2, and Durable Objects and a .dev.vars file; Postgres uses a Neon branch created for development. A staging Worker and a production Worker each bind their own KV namespace, R2 bucket, and Neon branch.

[32] **Observability.** Workers logs for the API, the jev_usage table for cost, and the product's own telemetry for everything about a run. A GET /api/quota route shows a user their remaining budget.

[33] **Failure posture.** TypeSafe unavailable or rate-limited: baseline fallback per batch, banner, fallback events. Neon unavailable: sign-in and run library fail with a clear message; simulation and local storage continue. R2 unavailable: save is retried from IndexedDB later; nothing is lost. Budget exhausted: Jev off for new decisions, banner, runs continue.

## 9. Impact on the brief and requirements

[34] This architecture reverses three out-of-scope items in the requirements v2.1 and the brief v1.3: one person, one browser, one run at a time; a server-side telemetry store; and browser-only storage. It adds requirement groups for accounts and sign-in, the server run library, share links, quotas and budgets, public mode, account deletion and export, and feature flags. It changes FR-061 (storage), FR-072 and FR-073 (the proxy becomes an authenticated, metered API), and NFR-006 (personal data is now present and minimized). The compliance context moves from no personal data to personal data, United States, consumers and researchers. These belong in a requirements document v3.0 and a brief v2.0, and the scope-change log records them.

## 10. ADR index

- ADR-001: Pure TypeScript engine with a seeded generator and no platform dependencies (`adr/ADR-001-pure-typescript-engine-20260919.md`)
- ADR-002: Simulation executes in the browser inside a dedicated Web Worker (`adr/ADR-002-engine-in-web-worker-20260919.md`)
- ADR-003: Cloudflare Workers with static assets and Hono as the platform (`adr/ADR-003-cloudflare-workers-hono-platform-20260919.md`)
- ADR-004: Neon Postgres with the serverless driver and Drizzle for relational state; R2 for gzipped run records; IndexedDB as local cache (`adr/ADR-004-neon-postgres-r2-indexeddb-20260919.md`)
- ADR-005: Google sign-in through Hono's OAuth middleware, KV sessions, and an auth-required feature flag (`adr/ADR-005-google-sign-in-hono-kv-auth-flag-20260919.md`)
- ADR-006: Public mode is browser-local: anonymous visitors get Jev with quotas but no server storage (`adr/ADR-006-public-mode-browser-local-20260919.md`)
- ADR-007: Quotas and the global Jev budget as Durable Object counters with baseline fallback (`adr/ADR-007-durable-object-quotas-baseline-fallback-20260919.md`)
- ADR-008: Jev call path: engine composes requests, Worker validates, meters, and forwards through the SDK (`adr/ADR-008-jev-call-path-engine-composes-worker-meters-20260919.md`)
- ADR-009: Frontend stack: Vite, React 19, Tailwind 4, the Cloudflare Vite plugin, uPlot charts, and an imperative canvas grid (`adr/ADR-009-frontend-vite-react-tailwind-uplot-20260919.md`)
- ADR-010: Repository as npm workspaces with three packages: engine, web, worker (`adr/ADR-010-npm-workspaces-three-packages-20260919.md`)
- ADR-011: Share links as unguessable revocable tokens; account deletion cascades (`adr/ADR-011-share-links-and-deletion-cascade-20260919.md`)
- ADR-012: Vitest for engine and Worker tests, with determinism and replay tests as the core suite (`adr/ADR-012-vitest-determinism-replay-tests-20260919.md`)

## 11. Open questions

[35] Owner allowlist: an OWNER_EMAILS variable is the proposal; confirm it should be Carson's Google account only at launch.

[36] Blob size cap per run: 20 megabytes gzipped is the proposal, which comfortably holds a Medium run and constrains Large runs at their caps.

[37] Retention default for signed-in runs: 90 days with the owner exempt is the proposal.

[38] Neon project: a new project named jev-mice with a development branch, or a branch inside an existing project. New project is the proposal.

[39] Whether local runs should upload automatically after sign-in or only on request. On request is the proposal, because automatic upload moves data to the server the user did not ask to store.
