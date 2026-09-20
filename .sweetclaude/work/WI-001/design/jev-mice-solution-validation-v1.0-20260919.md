---
title: jev-mice Solution Validation Report
version: 1.0
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: initial
previous_file: none
---

# jev-mice Solution Validation Report

**Version:** 1.0

**Date:** 2026-09-19

**Work item:** WI-001

**Verdict: DOES NOT PASS.** Seven blocking findings. The design is structurally sound and the requirements are almost completely covered, but three premises it rests on do not hold: the capacity model is about fourteen times over the decision service's published request limit, the container trust boundary does not provide the isolation it claims, and two mechanisms central to the product cannot execute as written. These are design decisions, not typing errors, and they get more expensive the later they are found.

**What was validated.** Requirements v3.0 (141 functional, 16 non-functional, 18 success metrics, 10 epics), brief v2.0, architecture v2.1 with 20 decision records, user flows v1.0, data model v1.0, interface design v1.0, technical specification v1.0, and the nine approved wireframes. Four independent passes: requirement-to-design coverage, cross-document contradiction, metrics and non-functional and security audit, and mechanical cross-reference plus arithmetic verification.

**What is sound, stated first because it is most of the set.** Every functional requirement but one has a design home. No current document still assumes the superseded browser-side shape. Every requirement, decision-record, and flow citation resolves. The event vocabulary matches between the requirements and the data model. Chunk sizing, retention, timeouts, capacity numbers, grid presets, derived caps, defaults, the activity cost table, and the cost arithmetic are consistent everywhere they appear. The decision-model request surface has no prompt-injection path: everything sent is engine-generated from fixed tables and templates, and no user-supplied text reaches it.

## 1. Blocking findings

### B-1. The capacity model is about fourteen times over the published request limit

The technical specification, section 9, reasons: "roughly one Jev request per tick. Twenty of those is twenty requests per second against a published limit of 1,200 per minute, so the rate limit binds at around sixty concurrent runs."

Three compounding errors.

*It contradicts itself.* 1,200 per minute is 20 per second. On its own figures the limit is saturated at twenty concurrent runs, not sixty.

*It drops the tick rate.* NFR-001 requires at least 2 ticks per second, so one request per tick is two per second per run, not one.

*"One request per tick" is wrong by roughly seven times.* Sixty mice on an eight-tick cadence produce 7.5 decision-ready mice per tick. Batching merges up to eight, but only within a 16-by-16 tile, and Medium is twenty tiles. Decision-ready mice almost never share a tile at three mice per tile, so batching saves about fifteen percent rather than eight times. Simulated over four thousand ticks: 6.8 requests per tick.

| | requests/tick | per run at 2 ticks/s | 20 runs | vs 1,200/min |
|---|---|---|---|---|
| Specification assumes | 1.0 | 1 req/s (implied 1 tick/s) | 1,200/min | at the limit |
| Actual, tile-constrained batching | 6.8 | 13.6 req/s | 16,320/min | **13.6x over** |
| If batching ignored tiles | 1.0 | 2.0 req/s | 2,400/min | 2x over |

The published token limit is not the constraint: twenty runs draw about 190,000 tokens per second against a 250,000 ceiling. It is purely the request count. **Concurrent runs that actually fit: about 1.5.** The configured cap is twenty.

This invalidates NFR-001, NFR-008, FR-086, and SM-01, and undermines the scaling section. It also interacts with B-2 below: FR-073, which requires outbound rate limiting with a configurable ceiling and retry-after handling, is the one orphaned requirement in the set. No limiter exists in any document, no ceiling appears in any settings list, and each container is an independent process with no shared budget, so there is nowhere for a deployment-wide request ceiling to live. GlobalLimits counts cost and active runs, not requests.

This needs a design decision, not an edit. Candidates: batch across tile boundaries and accept the context-rot risk the tile rule was created to avoid; enlarge tiles; lengthen the decision cadence; lower the concurrency cap to match reality; or accept a lower tick rate. Each trades against something the product cares about.

### B-2. Resume cannot read its own snapshot

Interface design section 9.1 states that container object-store credentials "allow writing objects and nothing else. No delete, no list, no read." Section 9.3 states that on watchdog timeout the coordinator "starts a new one with `resumeFrom` pointing at the last snapshot."

A container with no read credential cannot fetch the snapshot. Both escapes break a stated hard requirement: the coordinator reading it and passing it inline contradicts "megabytes never pass through the Worker or the object," and granting read access contradicts the write-only credential that the technical specification elevates to a hard requirement.

Blocks FR-094, FR-095, SM-12, the resume half of NFR-004, and epic EP-4.

### B-3. Unvalidated object keys leak one person's record to another

The chunk report carries `chunkKey`, `summaryKey`, and `snapshotKey` as strings the container has already written. No document specifies validating that these fall under `runs/{thisRunId}/`.

A container that is subverted or merely buggy can report a key belonging to another run. The chunk row stores it verbatim. `GET /api/runs/:id/chunks/:seq` authorizes the caller against the run, then serves the object named in the row, so the authorization check passes and another person's record, including every verbatim decision exchange, is served to this run's owner and to every share-link holder.

This is exactly what NFR-016 exists to prevent, relocated from the caller's identifier to the container's. The fix is one prefix check, but it is nowhere in the design.

### B-4. Container credentials are bucket-wide, so the claimed isolation does not hold

Interface design section 9.1 claims a subverted container "can write garbage into its own run's prefix; it cannot destroy or read another run." Nothing specifies how the credential is scoped to a prefix, and object-store tokens scope to a bucket, not a key prefix. Per-object scoping needs presigned URLs minted per key, which no document mentions.

Because summary and snapshot are explicitly overwritten in place, write-only does not mean non-destructive. Every container holds bucket-wide write access and can overwrite every other run's summary and snapshot, corrupting comparisons and making other in-flight runs resume into another run's state.

Related: chunks are declared immutable and served with a one-year immutable cache header, but the crash-and-resume path rewrites the same sequence number to the same key with different contents. Immutability is asserted, not enforced.

### B-5. The viewer's opening snapshot has no data source

Interface design section 8 promises that a viewer "always receives `hello` then `snapshot` before any frame, whether it is the first connection, a reconnect, or a late join," carrying mice, cats, food, traps, and holes. NFR-014 gives it two seconds.

The Run object does not hold that state: its four keys are meta, cursor, allowance, and control. The container protocol exposes only `/control`, `/inspect/:agentId`, and `/health` with no world-state endpoint. The only other source is the stored snapshot object, written once per chunk boundary and therefore up to 125 seconds stale.

The most-exercised path in the product has no specified data source. This is the finding most likely to force rework during implementation.

### B-6. The bounded-memory guarantee is contradicted by the snapshot schema

NFR-011 and FR-101 require that no process hold more than one chunk and that memory not grow with a run's length. The snapshot type carries `summaryTail: SummarySeries`, and the summary series is defined with `fromTick: Tick // always 0`.

The container must therefore hold the entire tick-zero-to-now series in memory for the life of the run, append a row per tick, and re-serialize the whole thing at every chunk boundary. At twenty thousand ticks across seventeen parallel arrays that is 340,000 resident numbers growing linearly with tick count, and FR-100's rewrite-at-every-boundary makes bytes written quadratic.

A second violation of the same requirement: the two behavioral metric functions in the technical specification take a whole record and iterate its events, and the section states they run in the analysis screens, not only in tests. A long run's events reach hundreds of megabytes.

### B-7. Fear would build correctly and do nothing

FR-043 has the fear level scale the *reach* of the danger field by 0.5, 1.0, 1.5, or 2.0. The technical specification restates it as a *multiplier*, and its own field formula in section 5.3 contains no fear term at all.

Section 5.3 also min-max normalizes each field across the nine candidate cells before weighting. A magnitude multiplier is exactly cancelled by that normalization:

```
unconcerned (0.5x)  normalized danger: [0.0, 0.316, 1.0, ...]
wary        (1.0x)  normalized danger: [0.0, 0.316, 1.0, ...]
panicked    (2.0x)  normalized danger: [0.0, 0.316, 1.0, ...]
```

Identical at every level. Scaling the reach instead, as the requirement actually says, does change the gradient (0.292 / 0.316 / 0.352). As specified, one of the two questions asked of the model on every single decision would have no effect on behavior, and nothing would fail.

## 2. High-severity findings

| # | Finding | Where |
|---|---|---|
| H-1 | `step` is accepted by the public interface, the socket, and the coordinator, and dropped at the last hop: the container control vocabulary is run, pause, stop only. FR-006 and FR-068 cannot be satisfied. | interface design 9.2, 9.3 |
| H-2 | Pause and speed are described as immediate in the flows but ride only on the chunk acknowledgement, up to 125 seconds away. The data model says the container reads control "at each tick boundary", which no route provides. | flows F-04, interface design 9.2, data model 6.1 |
| H-3 | Who writes to object storage is specified two incompatible ways. The interface design is right; the architecture and three *accepted* decision records still say the coordinator writes, which would push 8 MB through a 128 MB isolate. | architecture 5, ADR-013/014/019 |
| H-4 | The per-address budget is required by FR-118 and referenced in three places, and enforced nowhere: every metering call takes a single subject key. | interface design 9.4, data model 6.2 |
| H-5 | In public mode every per-visitor limit resets when the visitor clears one cookie: quota counter, and the one-active-run index. One visitor with a loop can occupy all twenty slots and drain the daily budget. The stated backstop is the per-address budget, which is H-4. | data model 5, 3.2 |
| H-6 | Account deletion cannot revoke sessions on other devices. Sessions are keyed by token with no per-user index, so only the requesting session is deleted. FR-132 and SM-14 cannot be met, and orphaned sessions authenticate as a user id with no row. | data model 5, 9 |
| H-7 | No Origin check is specified on the socket upgrade, which carries the same control authority as the POST route that SameSite protects. | interface design 8 |
| H-8 | NFR-004's resume clause is false in production: a resumed run issues fresh decision calls, and the requirements themselves state answers are not guaranteed identical. The guard test uses recorded fixtures, so it passes permanently while the property never holds. Re-simulated ticks also spend tokens twice and meter once. | requirements NFR-004, tech spec 7.1 |
| H-9 | SM-06 cannot measure what it claims. The initial cohort's actual personalities are never recorded, so the metric assumes them from configuration; and a 5-point band at ~160 mice is 1.5 sigma, failing a correct implementation roughly 40 to 45 percent of the time. | requirements SM-06, tech spec 7.2 |
| H-10 | SM-07's "cat adjacent" case is a reflex that preempts the decision, so it never produces a decision event. The metric silently measures only the "very close" band. The same function returns NaN on an empty sample and has no minimum-sample guard. | requirements SM-07, FR-016 |
| H-11 | SM-05 requires the twin comparison to highlight Jev on or off as the only difference, but that field sits outside the configuration blob the comparison diffs, so a twin diff shows zero differences. | requirements SM-05, data model 3.2 |
| H-12 | SM-03's "exactly" is unachievable: decision events carry wall-clock latency, which differs on every re-simulation. No field-exclusion list is specified. | requirements SM-03, data model 7.1 |
| H-13 | The cost ceiling assumes sixty mice, but the Medium cap is 160 and SM-06 presumes a hundred or more births. A colony that reproduces, which is the point, approaches 2.7 times the assumed decision rate and exceeds the ceiling before tick 2,000. | NFR-003, SM-08 |
| H-14 | The Sentry browser SDK is in the bundle while "no third-party scripts, pixels, or fingerprinting" is a hard requirement, and Sentry's ingest records a client address on every event. | tech spec 8, architecture 6 |
| H-15 | A hashed address is personal data, contradicting the data model's own claim that five fields are the complete inventory; and the salting scheme is an open question, where a static salt over IPv4 is brute-forceable across the whole space in seconds. | data model 3.1, 3.5, 13 |
| H-16 | The United States scoping that removes the wider privacy obligations is asserted in a state file and implemented nowhere, while public mode invites anonymous visitors from anywhere. It is also absent from the assumption register, where it is the entry with the largest blast radius. | compliance context, architecture 6 |

## 3. Medium and low findings

**Coverage gaps.** FR-090 has no mechanism freezing totals after a terminal status, and no guard against a late report from a container believed dead. FR-113 promises replay by share link, but the share surface omits the chunk index and the tick lookup that scrubbing needs. FR-140's estimate has no data source: no column records per-run latency or tokens per decision and no job aggregates recent runs. FR-089's queue cancellation is not specified; the only queue method handles a run finishing. FR-134 calls every limit a setting changeable without a code change, but all are deploy-time variables in a committed file.

**Contradictions.** Session lifetime is fixed thirty days in the requirements and a sliding window in the data model. Account deletion order is reversed between the flows and the data model, and the data model's order is the correct one. Chart count is seven in the requirements and six in the flows and the wireframes, with "decisions per tick" the one missing. Price per million tokens appears as a per-run form field in the flows and a deployment setting in the requirements. Export progress is described as chunk counts in the flows and a byte stream in the interface design. The Neon-outage posture describes a replay buffer that no storage key allocates. Container start has a 10-second target and a 30-second failure threshold with no statement of which is which.

**Metric and requirement wording.** FR-126 and SM-16 promise anonymous data gone 24 hours after creation, but expiry plus a daily sweep gives up to about 47 hours; NFR-015's "within 24 hours of expiry" is the achievable form. The same pair conflicts with the data model's deliberate retention of usage rows carrying an anonymous subject key. SM-01's error count is not a field any table records, and rate-limit errors are not separable from any other failure in the fallback reason enum. SM-10 specifies scanning responses in tests with no mechanism. NFR-013 asserts a 10-second start with no cold-start mechanism. NFR-010 forbids DOM, fetch, Date, and Math.random in the engine but only the last has an enforcement rule, and Date is the one that silently destroys determinism. NFR-009's keyboard half has no mechanism and no test.

**Defects introduced in the requirements rewrite.** The epic list and the traceability map both cite FR-042 and FR-043, which are memory and fear, where they mean FR-051 and FR-052, which are the personality types and percentages. The flows and one wireframe carry the same miscitation. FR-015 allows only the eight neighbouring cells while the movement specification requires nine candidates including standing still, which the normalization rule is written against. The requirements still describe `explore` as a least-visited map, which the technical specification replaced with a momentum vector, and FR-038 lists four signal fields where the movement score uses five. The requirements' three-bucket distance vocabulary does not contain the words the flagship metric matches on. The baseline rule for approaching suspect food is specified two opposite ways.

**Data model.** The usage table's run reference is declared not-null with cascade delete, while the prose two paragraphs later says it is nullable so rows survive their run. Both cannot be true. The chunk narrative omits the 8 MB cap and its "eighty rows" arithmetic assumes fixed 250-tick chunks, which is wrong wherever the byte cap fires first. Share tokens are stored only as a hash, which is right, but two routes need what was not stored: a recognizable prefix and an addressable token id.

**Naming.** GlobalBudget and GlobalLimits are both live: the data model renames it and says the rename applies to the decision records, but those were never edited. "Snapshot" names four different things: the engine's resume state, the viewer's opening message, an engine method, and a statistics read. The engine's serialization pair is `serialize`/`restore` in two documents and `snapshot` with no `restore` in two others, which matters because resume is its only consumer. Two accepted decision records still argue for the superseded browser-side shape in their rationale, and one still permits browser mirroring of records that no other document implements and that the flows contradict.

## 4. What this means

The requirements and the design describe the same product, and almost everything the requirements ask for has somewhere to live. What failed is narrower and deeper: three load-bearing premises are wrong, and a scattering of measurements cannot measure what they claim.

The capacity finding is the one that changes the shape of the product. Everything else on the blocking list is a contained correction once the decision is made, but B-1 requires choosing what to give up: context quality in batching, decision cadence, concurrency, or tick rate.

The security findings cluster in one place, the container trust boundary, and are cheap to fix now and expensive later. B-3 in particular is a single prefix check standing between the design and a cross-person record leak.

The metric findings matter more than their severity suggests. Four of the eighteen checks cannot measure what they describe, and two of those would pass a green test while the underlying property is false. A test suite that asserts something narrower than the requirement is worse than no test, because it produces confidence.
