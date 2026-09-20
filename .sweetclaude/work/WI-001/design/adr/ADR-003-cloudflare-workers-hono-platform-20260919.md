---
title: ADR-003: Cloudflare Workers with static assets and Hono as the platform
version: 1.0
status: accepted
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: initial
previous_file: none
---

# ADR-003: Cloudflare Workers with static assets and Hono as the platform

**Date:** 2026-09-19

**Status:** Accepted

## Context

The product is a hosted, multi-tenant web app with Google sign-in that can be switched to open public access. It needs a key-holding API, per-user and global Jev quotas, blob storage for run records, a relational store, and static hosting. Carson already has Cloudflare R2 and Neon connected.

## Decision

A single Cloudflare Worker serves the API with Hono and the built React app through the static assets binding, with run_worker_first on /api/* and single-page-application not-found handling. KV holds sessions, R2 holds run records, Durable Objects hold quota and budget counters, and Neon Postgres holds relational state. Deployment is wrangler deploy; local development is the Cloudflare Vite plugin running the real workerd runtime with local emulation of every binding.

## Rationale

R2 is native, static hosting is free, idle cost is near zero, and Durable Objects give exact per-subject counters without a persistent server process. The TypeSafe SDK is fetch-based, guards every Node reference, and detects the Workers runtime by name, so it runs unmodified.

## Consequences

Easier: cost, deployment, counters, R2 access. Harder: Workers runtime constraints on any future Node-only dependency; Durable Objects always run locally in development, which is fine for counters.

## Alternatives Considered

Single Node process on Fly.io (Claude's recommendation; declined in favor of Cloudflare). Vercel serverless (rejected: no persistent process, counters need external state, duration limits near the fallback window). Locally run Brogue-style (rejected: the product is hosted and multi-tenant).
