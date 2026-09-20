---
title: ADR-005: Google sign-in through Hono's OAuth middleware, KV sessions, and an auth-required feature flag
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

# ADR-005: Google sign-in through Hono's OAuth middleware, KV sessions, and an auth-required feature flag

**Date:** 2026-09-19

**Status:** Accepted

## Context

Users register with Google. Authentication must be switchable off for open public access, behind a feature flag. Auth.js has no plain-Workers adapter and Passport assumes Node.

## Decision

The Worker uses googleAuth from @hono/oauth-providers with scopes openid, email, and profile. On callback the Worker upserts the user (Google subject id, email, name, avatar URL) in Postgres, creates a 256-bit random session token stored in KV with a 30-day expiry, and sets it in an HttpOnly, Secure, SameSite=Lax cookie. A session middleware resolves the cookie to a user on every request. The AUTH_REQUIRED variable drives one branch: when true, app routes without a session redirect to sign-in; when false, visitors without a session receive a signed anonymous-session cookie that carries anonymous quotas and no server storage rights.

## Rationale

The smallest amount of security-sensitive code Carson owns: the OAuth dance including state is library code, KV expiry handles sessions, and the flag is one middleware rather than two code paths. Every piece is designed for the Workers runtime.

## Consequences

Easier: sign-in, session expiry, toggling public mode. Harder: dependence on a 0.x middleware package; KV's eventual consistency, harmless for sessions.

## Alternatives Considered

Arctic plus hand-written sessions (rejected: more security-sensitive code to own). Cloudflare Access with Google IdP (rejected: a gate, not in-app registration; seat pricing). Hand-rolled OAuth (rejected: most ways to get it wrong).
