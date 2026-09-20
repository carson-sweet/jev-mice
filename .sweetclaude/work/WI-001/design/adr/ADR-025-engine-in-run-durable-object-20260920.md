---
title: "ADR-025: The engine runs inside the Run Durable Object, advancing a batch of ticks per alarm"
version: 1.0
status: accepted
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-20
audience: hybrid
nda: false
changes: initial
previous_file: none
---

# ADR-025: The engine runs inside the Run Durable Object, advancing a batch of ticks per alarm

**Date:** 2026-09-20

**Status:** Accepted. Supersedes ADR-013 and ADR-016.

## Context

ADR-013 put the engine in a Cloudflare Container, one per run, orchestrated by a
Run Durable Object. Its stated reason was that plain Workers cap CPU per
invocation, isolates at 128 MB, and outgoing connections at six, "which shapes
any engine hosted directly in a Durable Object."

Three things are true now that were not when that was written.

The engine has no dependencies. `packages/engine` imports nothing at all -- no
`node:` modules, no packages -- and the Jev provider is fetch-based and depends
only on the engine. Both run on the Workers runtime unchanged. Nothing about
either needs a container; the container was chosen for the shape of the process,
not for anything the code requires.

The memory objection was answered by a different fix. A 3,000-tick run once held
335,880 events and 136 MB in its buffer, which is what made an in-isolate engine
look impossible. Events now drain into chunks as they are produced, so live
memory is bounded by the chunk size rather than by the length of the run.

Snapshot and resume already exist, by ADR-019, and are verified byte-identical:
500 ticks equals 250 plus a restore plus 250. A design that stops every few
hundred ticks and resumes is therefore not a compromise imposed by the platform.
It is the thing the engine was already built and tested to do.

Measured: a medium tick costs about 1.2 ms on the fixed rules, so a 200-tick
batch is roughly a quarter of a second of CPU. A Jev run spends its time waiting
on the API rather than computing.

## Decision

The engine runs inside the Run Durable Object. Each alarm advances a batch of
ticks, flushes completed chunks to R2, writes a snapshot to Durable Object
storage, and sets the next alarm. Viewers attach over hibernatable WebSockets,
so a run with nobody watching costs nothing but its storage.

No container image, no registry, no container build step, and no container
callback token.

## Rationale

It removes a whole deployment artifact and its build, it removes the per-container
compute bill, and it removes a credential from the security surface. What it costs
is a bound on batch size, which is a number to tune rather than a design to
revisit.

The engine's determinism is what makes this safe. Because a snapshot resumes to a
byte-identical event stream, a run advanced in batches of 200 is the same run as
one advanced in a single pass. That is asserted by the existing resume tests, not
assumed here.

## Consequences

Easier: one fewer artifact to build and deploy; no registry; cheaper idle runs;
one fewer credential; local development is the same runtime as production.

Harder: a batch must fit inside the invocation's CPU budget, so batch size becomes
an operational parameter with a measured basis. Outbound connections are limited
to six per isolate, so concurrent Jev batches within a tick must be capped at six
rather than fired all at once -- a constraint the implementation has to honour
explicitly.

Watch for: a long Large run with a large living population is the case with the
least headroom, since decision volume scales with population. If a batch overruns,
the batch shrinks; the architecture does not change.

## Alternatives Considered

**Containers, as ADR-013 specified.** Rejected as unnecessary rather than wrong.
It is the heavier path -- an image, a registry, container compute, a callback
token -- to host code that has no dependencies and already snapshots cleanly. It
remains the fallback if a batch cannot be made to fit.

**The simulation off Cloudflare entirely, with Workers serving only the viewer.**
Rejected: it splits the deployment across two providers and reintroduces a
long-lived machine to operate, which is what the hosted design was meant to end.
