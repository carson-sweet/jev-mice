---
title: jev-mice Architecture
version: 2.1
status: superseded
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: approved as final by Carson Sweet on 2026-09-19; paragraph numbers removed
previous_file: jev-mice-architecture-deprecated-v2.1-20260919.md
---

# jev-mice Architecture

**Version:** 2.1 (final)

**Date:** 2026-09-19

**Work item:** WI-001

**Companions:** jev-mice Product Brief v1.3, jev-mice Product Requirements Document v2.1. This document changes the product's shape from a single-user local app to a hosted multi-tenant web app with server-side simulation; section 9 lists what the brief and requirements must absorb.

## 1. Overview and guiding principles

jev-mice is a hosted web application. A user configures a run; the server simulates it in a dedicated container, streaming frames to whoever is watching and writing the record to storage in chunks as it goes; the browser draws. Users sign in with Google, keep a library of runs, share runs by link, and compare runs side by side. An operator can switch authentication off for open public access, in which case visitors simulate under quotas with a 24-hour footprint and no sharing.

**The simulation runs on the server, one process per run.** A run is a Node process in a Cloudflare Container with its own memory. It starts when asked, runs to its configured tick count whether or not anyone is watching, and exits.

**Nothing holds a run in memory.** Events leave the container in gzipped chunks of a fixed tick range. Charts read a compact summary series. Viewers receive frames. Replay pages through chunks. The largest thing any process holds is one chunk.

**Code owns the clear answers, Jev owns the tradeoffs.** Reflexes, arithmetic, pathing, timers, and persistence are code. Which drive wins, how afraid to be, which mate, whether a hole is safe: those are Jev's, asked in words and answered in probabilities.

**Determinism is a boundary.** The engine cannot import a clock or a socket. Randomness and decisions enter through injected providers. Re-simulating a run from its configuration, seed, and logged Jev responses reproduces its record to the byte.

**Every Jev exchange is preserved verbatim** in the chunk that contains it, so the inspector shows exactly what was sent and exactly what came back.

**Cost is bounded from three directions**, per subject, per address, and per deployment, checked once per chunk. Exhaustion degrades to baseline rules with a banner; it never breaks a run.

**Personal data is minimal and deletable.** Google subject id, email, name, avatar. Deletion cascades to every run, chunk, share, and usage row.

## 2. Technology decisions

| Concern | Decision | Reference |
|---|---|---|
| Language | TypeScript throughout | 5.x |
| Engine | Standalone package, xoshiro128** seeded generator, provider interfaces | ADR-001 |
| Simulation host | Cloudflare Container per run (Node), Run Durable Object orchestrates | ADR-013 |
| Run records | Gzipped chunks in R2 (250 ticks or 8 MB, whichever first), summary series object, chunk index in Postgres | ADR-014, ADR-020 |
| Resume | Engine snapshot at every chunk boundary; automatic restart from the last one | ADR-019 |
| Limits | basic containers, 1 active run per subject, 20 global, 30-day and 24-hour retention, Neon project jev-mice | ADR-020 |
| Platform | Cloudflare Workers with static assets, Hono, Containers, Durable Objects, KV, R2 | ADR-003 |
| Sign-in | Google via @hono/oauth-providers, KV sessions, AUTH_REQUIRED flag | ADR-005 |
| Public mode | Server-side execution, 24-hour anonymous retention, no sharing | ADR-015 |
| Quotas | QuotaCounter and GlobalBudget Durable Objects, per-chunk allowance | ADR-007, ADR-016 |
| Jev client | @typesafe-ai/sdk 0.6 in the container, key in container environment | ADR-016 |
| Relational store | Neon Postgres 17 via serverless driver, Drizzle ORM | ADR-004 |
| Browser | Vite, React 19, Tailwind 4, uPlot, canvas; viewer only | ADR-009, ADR-017 |
| Sharing | Unguessable revocable tokens, deletion cascades | ADR-011 |
| Repository | npm workspaces: packages/engine, apps/web, apps/worker, apps/sim | ADR-018 |
| Tests | Vitest; determinism and re-simulation tests as the core suite | ADR-012 |

## 3. Architecture style and rationale

A modular monolith deployed as one Worker plus one container image, sharing one engine package. The Worker is the front door and the coordinator: static assets, API, sign-in, Durable Objects. The container is the muscle: one per run, short-lived, stateless between runs. The browser is the eyes.

The seams that matter are the engine's provider interface (how decisions and randomness enter), the container-to-Durable-Object protocol (frames, chunks, usage, control), and the viewer WebSocket protocol (snapshot, frames, commands). Each can change without touching the others.

## 4. Component diagram

```
Browser (React viewer)
  routes: sign-in, config, live, inspector, runs, compare, share, account
  canvas from frames, uPlot from summary series, replay pages chunks
      |  HTTPS /api/*            |  WebSocket /api/runs/:id/stream
      v                          v
Cloudflare Worker (Hono, static assets)
  session -> auth flag -> routes: auth, me, runs, share, account, quota
      |                          |
      v                          v
  Neon Postgres              Run Durable Object (one per run)
  users, runs, run_chunks,     status, viewers, chunk index, allowances,
  share_tokens, jev_usage      control; writes R2, Postgres; fans out frames
      ^                          |  start/stop        ^  frames, chunks,
      |                          v                    |  usage, allowance
      |                    Cloudflare Container (apps/sim, Node)
      |                      packages/engine loop; Jev provider (SDK);
      |                      baseline provider; chunk buffer; summary
      |                          |
      |                          v
  R2: runs/{id}/chunks/{n}.json.gz, runs/{id}/summary.json.gz     TypeSafe API
KV: sessions      Durable Objects: QuotaCounter per subject, GlobalBudget
```

## 5. Data flow

**Start a run.** The browser posts configuration to /api/runs. The Worker validates it with the engine's validator, checks the subject's active-run limit and a whole-run token estimate against quota, inserts a run row with status queued, and calls start on the Run Durable Object for that id. The Durable Object obtains its container, passes the run configuration, seed, its own callback address and token, and the TypeSafe key in the environment, and marks the run running when the container reports ready.

**Tick loop.** The container advances the engine. Each tick, decision-ready mice are grouped by 16-by-16 tile up to eight, one System One request per group, batches run concurrently against the SDK with a 2,000 millisecond timeout, and answers apply per the contract. Events append to the current chunk buffer; the summary series gains one row per tick.

**Chunk boundary.** When the chunk reaches 250 ticks or 8 MB uncompressed, whichever first, the container gzips it and posts it with the engine snapshot and its usage report to the Durable Object, and asks for the next allowance. The Durable Object writes the chunk and the snapshot to R2, inserts a run_chunks row, reconciles usage against QuotaCounter and GlobalBudget, writes a jev_usage row, rewrites the summary object, updates current_tick, and answers with an allowance or a denial. On denial the container switches to baseline decisions for the next chunk and emits a fallback event.

**Frames.** The container posts a frame delta to the Durable Object at most every 50 milliseconds: moved animals, state changes, hole occupancy, meter values. The Durable Object broadcasts to connected viewer WebSockets. With no viewers it drops frames; the record is unaffected.

**Watch a run.** The browser opens a WebSocket to /api/runs/:id/stream. The Worker authorizes (owner, valid share token, or the anonymous cookie that started it) and hands the socket to the Run Durable Object, which sends a full snapshot then frames. Pause, resume, step, speed, and stop are messages to the Durable Object, which forwards them to the container. A closed tab changes nothing; reopening resumes from the current snapshot.

**Inspect an animal.** Live: the viewer asks the Durable Object, which asks the container for that animal's latest decision, memory, and state. Replay: the viewer reads them from the chunk in view.

**Finish.** The container writes the last chunk and the final summary, posts done, and exits. The Durable Object marks the run completed with totals, and releases the container.

**Replay and compare.** The browser lists a run's chunks, fetches the chunk covering the tick in view through an authorized Worker route, decompresses it, and renders. Scrubbing pages chunks. Comparison fetches two summary objects, diffs the two configurations, and overlays the series.

**Sign-in, public mode, sharing, deletion.** As in ADR-005, ADR-015, and ADR-011. Public mode differs from signed-in only in the subject key, the quotas, a 24-hour retention, and the absence of sharing and a library.

## 6. Compliance and security requirements

Personal data is present: Google subject id, email address, display name, and avatar URL of each signed-in user. Carson has scoped users to the United States, so under the framework's rules only the data-minimization baseline applies. HARD REQUIREMENT items are non-negotiable regardless.

**HARD REQUIREMENT. Minimal scopes and fields.** Request only openid, email, and profile. Store only subject id, email, name, and avatar URL.

**HARD REQUIREMENT. No analytics or tracking.** No third-party scripts, pixels, or fingerprinting. Telemetry describes simulated animals and the subject's own Jev usage.

**HARD REQUIREMENT. Secrets stay server-side.** TYPESAFE_API_KEY, GOOGLE_SECRET, NEON_DATABASE_URL, SESSION_SIGNING_KEY, and the container callback token exist only as Worker secrets and container environment. The browser bundle and every API response contain no key material.

**HARD REQUIREMENT. Session and cookie hygiene.** 256-bit random session tokens in KV with 30-day expiry, HttpOnly, Secure, SameSite=Lax cookies; OAuth state handled by the middleware; anonymous cookies HMAC-signed.

**HARD REQUIREMENT. Authorization on every run route and stream.** Owner, valid share token, or the anonymous cookie that created the run. Share access is read-only.

**HARD REQUIREMENT. Container-to-Durable-Object calls are authenticated** with a per-run token issued at start, so a container can only report into its own run.

**Recommended.** Cascading account deletion, account export (a first-version feature, since retention is 30 days), a privacy notice on sign-in, retention of 30 days for signed-in runs with the owner exempt and a badge in the last 7 days, 24 hours for anonymous runs, enforced by a daily cron trigger.

## 7. Boundary design

**packages/engine.** World, clock, signal fields, mice, cats, food, traps, mouseholes, perception, memory, reproduction, personality, the decision contract (request composition, answer application, baseline substitution, bucketing), the typed event union, chunk and summary formats, re-simulation, the seeded generator, configuration validation with grid caps. Exposes createEngine(config, seed, providers), step(), subscribe(), snapshot(), and all shared types. Imports nothing platform-specific.

**apps/sim.** The container's Node process: reads run configuration and environment, instantiates the engine with the Jev provider (SDK), the baseline provider, and the seeded generator; runs the loop; buffers the current chunk and the summary series; speaks the container-to-Durable-Object protocol. Nothing else.

**apps/worker.** Hono app, session and auth-flag middleware, routes, the Run Durable Object, QuotaCounter and GlobalBudget Durable Objects, the Container binding, Drizzle schema and migrations, R2 access. Imports types from the engine and nothing else from it.

**apps/web.** Routing and screens, canvas renderer, chart components, replay pager with DecompressionStream, the WebSocket client, the API client. No engine code.

**What must not bleed.** No DOM, fetch, Date, or Math.random inside the engine. No simulation logic in the Worker, the Durable Objects, or the browser. No full record in any process. No personal data in chunks, summaries, or frames.

## 8. Operational model

**Flags and limits** as Worker variables passed through to containers where relevant: AUTH_REQUIRED, JEV_ENABLED, OWNER_EMAILS, ANON_DAILY_TOKENS, USER_DAILY_TOKENS, IP_DAILY_TOKENS, GLOBAL_DAILY_COST_MICROS, JEV_PRICE_PER_MTOK_MICROS, MAX_ACTIVE_RUNS_PER_SUBJECT (1), MAX_ACTIVE_RUNS_GLOBAL (20), CHUNK_TICKS (250), CHUNK_MAX_BYTES (8 MB), FRAME_INTERVAL_MS (50), RUN_RETENTION_DAYS (30, owners exempt, badge in the last 7), ANON_RETENTION_HOURS (24), CONTAINER_INSTANCE_TYPE per preset (basic).

**Capacity.** Each active run is one container. Per-user and global active-run limits gate starts; a run beyond the global limit waits in status queued and the viewer shows its position. Every preset runs on the basic type (1/4 vCPU, 1 GiB); the per-preset setting exists so Large can move up after measurement.

**Environments.** Local development runs the Worker and Durable Objects in the real runtime with local KV and R2, the container image locally under the Cloudflare tooling, and the dev branch of the Neon project jev-mice. Staging and production Workers bind their own KV, R2, the staging and main Neon branches, and container image tag.

**Failure posture.** TypeSafe unavailable or budget exhausted: baseline for the affected batch or chunk, banner, fallback events. Container dies mid-run: the Durable Object starts a new container from the last snapshot and the run continues from the first tick after the last written chunk; chunks already written stand. Neon unavailable: sign-in and library fail with a clear message; running containers keep writing chunks to R2 and the Durable Object replays the row writes when Neon returns. R2 unavailable: the container retries the chunk post with backoff and pauses the loop after a bounded buffer.

## 9. Impact on the brief and requirements

This architecture reverses three out-of-scope items in requirements v2.1 and brief v1.3 (single user, server-side store, browser-only storage) and moves execution to the server. It adds requirement groups for accounts and sign-in, the server run library, share links, quotas and budgets, public mode, account deletion and export, feature flags, run lifecycle (queued, running, paused, completed, failed, cancelled), and runs that continue without a viewer. It changes FR-061 (storage), FR-072 to FR-074 (there is no browser Jev route; batching lives in the container), NFR-001 (tick rate is a server property; the viewer's frame rate is separate), NFR-002 (frame rate from frames, not from ticking), NFR-006 (personal data present and minimized), NFR-010 (engine isolation now also excludes the Durable Object and container protocols), and NFR-011 (bounded memory per process replaces the 100 megabyte export cap). These belong in requirements v3.0 and brief v2.0.

## 10. ADR index

- ADR-001: Pure TypeScript engine with a seeded generator and no platform dependencies (`adr/ADR-001-pure-typescript-engine-20260919.md`)
- ADR-002: Simulation executes in the browser inside a dedicated Web Worker (superseded) (`adr/ADR-002-engine-in-web-worker-20260919.md`)
- ADR-003: Cloudflare Workers with static assets and Hono as the platform (`adr/ADR-003-cloudflare-workers-hono-platform-20260919.md`)
- ADR-004: Neon Postgres with the serverless driver and Drizzle for relational state; R2 for gzipped run records; IndexedDB as local cache (superseded) (`adr/ADR-004-neon-postgres-r2-indexeddb-20260919.md`)
- ADR-005: Google sign-in through Hono's OAuth middleware, KV sessions, and an auth-required feature flag (`adr/ADR-005-google-sign-in-hono-kv-auth-flag-20260919.md`)
- ADR-006: Public mode is browser-local: anonymous visitors get Jev with quotas but no server storage (superseded) (`adr/ADR-006-public-mode-browser-local-20260919.md`)
- ADR-007: Quotas and the global Jev budget as Durable Object counters with baseline fallback (`adr/ADR-007-durable-object-quotas-baseline-fallback-20260919.md`)
- ADR-008: Jev call path: engine composes requests, Worker validates, meters, and forwards through the SDK (superseded) (`adr/ADR-008-jev-call-path-engine-composes-worker-meters-20260919.md`)
- ADR-009: Frontend stack: Vite, React 19, Tailwind 4, the Cloudflare Vite plugin, uPlot charts, and an imperative canvas grid (superseded) (`adr/ADR-009-frontend-vite-react-tailwind-uplot-20260919.md`)
- ADR-010: Repository as npm workspaces with three packages: engine, web, worker (superseded) (`adr/ADR-010-npm-workspaces-three-packages-20260919.md`)
- ADR-011: Share links as unguessable revocable tokens; account deletion cascades (`adr/ADR-011-share-links-and-deletion-cascade-20260919.md`)
- ADR-012: Vitest for engine and Worker tests, with determinism and replay tests as the core suite (`adr/ADR-012-vitest-determinism-replay-tests-20260919.md`)
- ADR-013: Engine executes server-side in a Cloudflare Container per run, orchestrated by a Run Durable Object (`adr/ADR-013-server-side-engine-container-per-run-20260919.md`)
- ADR-014: Run records as gzipped tick-range chunks in R2 with a compact summary series; nothing buffered in memory (`adr/ADR-014-chunked-run-records-summary-series-20260919.md`)
- ADR-015: Public mode runs server-side with 24-hour anonymous retention and no sharing (`adr/ADR-015-public-mode-server-side-24h-retention-20260919.md`)
- ADR-016: Jev is called from the container with the key in its environment; the Run Durable Object meters per chunk (`adr/ADR-016-jev-from-container-chunk-metering-20260919.md`)
- ADR-017: Browser is a viewer: React renders frames and summary series, holds no engine (`adr/ADR-017-browser-as-viewer-20260919.md`)
- ADR-018: Repository as npm workspaces with four packages: engine, web, worker, sim (`adr/ADR-018-npm-workspaces-four-packages-20260919.md`)
- ADR-019: Engine snapshot at every chunk boundary and automatic resume after container failure (`adr/ADR-019-engine-snapshot-and-resume-20260919.md`)
- ADR-020: Operational limits for the first version: chunking, instance type, active runs, retention, database layout (`adr/ADR-020-first-version-operational-limits-20260919.md`)

## 11. Open questions

None. The six questions the previous version left open are resolved in ADR-019 and ADR-020: chunks flush at 250 ticks or 8 MB; every preset runs on the basic container type; one active run per subject and 20 globally with a queue; retention is 30 days signed-in with owners exempt and 24 hours anonymous; resume from the last chunk boundary is in the first version; the database is a new Neon project named jev-mice with main, staging, and dev branches.
