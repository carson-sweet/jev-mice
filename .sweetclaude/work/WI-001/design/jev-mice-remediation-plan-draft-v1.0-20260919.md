---
title: jev-mice Remediation Plan
version: 1.0
status: draft
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: initial draft
previous_file: none
---

# jev-mice Remediation Plan

**Version:** 1.0 (draft)

**Date:** 2026-09-19

**Work item:** WI-001

**Source:** Solution Validation Report v1.0 — 7 blocking, 16 high, about 35 medium and low findings.

**Shape of the work.** Four decisions are yours; everything else is correction. Eleven work packages, six of which need no decision and can start immediately. One package, the capacity model, changes a design premise; the other ten are contained. Nothing here requires rewriting a document from scratch: the largest single edit is the technical specification's engine and capacity sections.

## 1. Decisions needed

### D-1. Capacity: how the deployment fits inside the request limit

This is the only finding that changes the product's shape. The published limit is 1,200 requests per minute. Measured behaviour under the current design is 6.76 requests per tick per run, because batching merges at most eight mice **from the same 16-by-16 tile** and 7.5 decision-ready mice scattered over twenty tiles almost never share one.

The single biggest lever is dropping the tile constraint. Grouping the decision-ready mice by spatial sort and filling to eight, and batching cats with each other, takes 6.76 down to 1.74 requests per tick, a 3.9x improvement, while keeping batched mice near one another.

That still does not reach twenty concurrent runs at two ticks per second. What it does reach:

| concurrent runs | ticks/s each | a 2,000-tick run takes |
|---|---|---|
| 1 | 11.5 | 3 min |
| 2 | 5.7 | 6 min |
| 3 | 3.8 | 9 min |
| 5 | 2.3 | 14 min |
| 10 | 1.1 | 29 min |
| 20 | 0.6 | 58 min |

**Recommendation: adopt spatial-sort batching, keep the cap at twenty, and let throughput share one deployment-wide request budget.** Restate NFR-001 as a tiered target: at least two ticks per second up to five concurrent runs, degrading predictably beyond that, with the live view showing the current rate. Give the request budget a real home by extending the GlobalLimits object to lease request rate alongside the token allowance it already grants, which also gives FR-073, the one orphaned requirement, somewhere to live.

Rationale: server-side execution already removed the reason a run has to be fast, because a run now outlives the tab that started it. A watcher who wants speed gets it when the deployment is quiet, and a busy deployment stays available to everyone instead of refusing new runs. Degrading throughput is a better failure than refusing service or silently blowing the limit.

Alternatives, if you prefer: cap concurrency at five and keep a hard two ticks per second; lengthen the decision cadence from eight ticks to sixteen, which halves traffic at the cost of less responsive animals; or ask TypeSafe for a higher limit, which their documentation says is available, and treat the published figure as temporary.

### D-2. Error reporting in the browser versus the no-third-party rule

The architecture makes "no third-party scripts, pixels, or fingerprinting" a hard requirement. The technical specification puts the Sentry browser SDK in the bundle, and Sentry's ingest records a client address on every event.

**Recommendation: drop Sentry from the browser and keep it on the server and the simulation process.** Report browser errors through a first-party endpoint on your own Worker, which forwards to Sentry server-side with the address stripped. You keep the stack traces and lose nothing but a little convenience, and the hard requirement stays true as written.

Alternative: keep the browser SDK and amend the hard requirement to permit a named error-reporting service, disclosed in the privacy notice.

### D-3. The United States scoping

The reduced privacy obligations rest on users being in the United States. Nothing in the design implements that: there is no geographic check anywhere, and public mode invites anonymous visitors from anywhere. The assumption is also absent from the assumption register, where it has the largest blast radius of anything in it.

**Recommendation: register it as an explicit accepted risk rather than pretending it is a control.** Add it to the assumption register with a validation plan, and adopt the three cheap things that make it moot: deletion that actually works, export, and a privacy notice. Those are already required by FR-129 to FR-133.

Alternatives: implement a geographic gate at sign-in, which is straightforward but blocks the public demonstration; or design to the wider baseline now, which you declined earlier and which is mostly the three things above.

### D-4. The personality-mix metric threshold

SM-06 requires each personality's share to be within five points of its configured percentage, at a hundred or more births. At roughly 160 mice the standard error on a 25 percent share is 3.4 points, so the five-point band is about 1.5 sigma and at least one of four personalities fails by chance on roughly 40 to 45 percent of correct runs.

**Recommendation: keep the five-point band and raise the trigger to a thousand mice ever alive**, where the standard error falls to 1.4 points and the band becomes about 3.5 sigma. Where a run does not reach that, report the observed deviation without a pass or fail.

Alternative: keep the trigger and widen the band to ten points, which passes correct implementations reliably but would not catch a genuinely skewed draw.

## 2. Work packages

Six of these need no decision from you and can begin immediately.

| # | Package | Fixes | Needs |
|---|---|---|---|
| WP-1 | Capacity and the request budget | B-1, FR-073 orphan, NFR-001, NFR-008, SM-01, FR-086 | D-1 |
| WP-2 | Container trust boundary | B-2, B-3, B-4, H-3, container fencing | nothing |
| WP-3 | Viewer state source | B-5, NFR-014, SM-17, FR-141 | nothing |
| WP-4 | Bounded memory | B-6, NFR-011, FR-101, streaming metrics | nothing |
| WP-5 | Fear mechanics | B-7 | nothing |
| WP-6 | Control channel | H-1, H-2 | nothing |
| WP-7 | Quotas and anonymous abuse | H-4, H-5 | D-1 |
| WP-8 | Sessions and deletion | H-6, SM-14, FR-132 | nothing |
| WP-9 | Metrics that cannot measure | H-8 to H-13 | D-4 |
| WP-10 | Privacy and observability | H-14, H-15, H-16 | D-2, D-3 |
| WP-11 | Document corrections | about 35 medium and low | nothing |

### WP-1. Capacity and the request budget

Replace tile-bounded batching with a deterministic spatial sort filled to eight, and batch cats with each other. Extend GlobalLimits to lease request rate as well as token allowance, granted on the same chunk acknowledgement that already carries the token allowance, so FR-073 gains a mechanism and each container throttles against a shared budget rather than independently. Restate NFR-001 as tiered, correct the arithmetic in the technical specification's scaling section, add the rate ceiling to the settings list, and add a run's achieved tick rate to the live meter.

Documents: technical specification 5.2 and 9, requirements FR-073, FR-074, FR-086, NFR-001, NFR-008, SM-01, architecture 8, interface design 9.2 and 10.

### WP-2. Container trust boundary

One change fixes three blocking findings: **the coordinator mints presigned URLs and the container holds no storage credential at all.** The coordinator chooses every object key and hands the container a presigned PUT for each, which removes the unvalidated-key path entirely because the container can no longer name a key. It hands a presigned GET for the snapshot on resume, which unblocks resume without granting read access to anything else. Prefix scoping becomes unnecessary because each URL is good for exactly one object.

Also: rotate the callback token on every restart so a container the watchdog declared dead cannot report into its replacement's run, and settle who writes to storage in the architecture and in the three accepted decision records that still say the coordinator does.

Documents: interface design 9.1, 9.2, 9.3; architecture 5 and 6; ADR-013, ADR-014, ADR-019 amended or superseded; data model 4; technical specification 10.

### WP-3. Viewer state source

Add a world-state endpoint to the container protocol and have the coordinator hold the most recent frame it broadcast. A viewer connecting is served the cached frame when it is fresh and a fetch from the container otherwise, which keeps the two-second budget without adding storage or staleness.

Documents: interface design 8 and 9.3; data model 6.1; architecture 5; requirements NFR-014.

### WP-4. Bounded memory

Split the summary series into per-chunk segments written alongside each chunk and stitched by the reader, so the container holds only the current segment and writes stay linear instead of quadratic. Remove the whole-series tail from the snapshot. Rewrite the two metric functions as streaming reducers over a chunk iterator, and define the record type as a lazy chunk stream rather than a loaded object.

Documents: data model 7.3 and 7.4; requirements FR-100, FR-101, NFR-011; technical specification 7.2; interface design 5.

### WP-5. Fear mechanics

Write the fear term into the danger formula as a distance scale, matching what FR-043 actually says, and add a test that asserts the normalized danger gradient differs between fear levels. That test is what would have caught this.

Documents: technical specification 5.3 and 6.3; requirements FR-043.

### WP-6. Control channel

Add step to the container's control vocabulary, and move pause, resume, speed, and step onto the push channel so they take effect immediately rather than at the next chunk boundary up to two minutes away. Reconcile the data model's "each tick boundary" wording with whatever the protocol actually does.

Documents: interface design 9.2 and 9.3; data model 6.1; user flows F-04.

### WP-7. Quotas and anonymous abuse

Make the chunk-boundary reservation consult every applicable subject and deny on the first refusal, which gives FR-118's per-address budget an enforcement path. Bind an anonymous run's quota primarily to the address rather than to the cookie, so clearing a cookie no longer resets the limit, and record the address hash on the run so the one-active-run rule survives a cookie reset.

Documents: interface design 9.4 and 10; data model 3.2 and 6.2; requirements FR-118; architecture 8.

### WP-8. Sessions and deletion

Add a per-user session index so sign-out and account deletion can revoke every session rather than only the requesting one, and make the session middleware reject a session whose user row is gone. Fix the session lifetime contradiction in favour of whichever the requirement states.

Documents: data model 5 and 9; interface design 7; requirements FR-078, FR-132.

### WP-9. Metrics that cannot measure

Four success metrics cannot measure what they claim. Add a spawn event so the initial cohort's actual personalities are recorded rather than assumed. Move the decision-source field inside the configuration blob, or diff it explicitly, so a twin comparison highlights the one thing that differs. Qualify SM-07 on the band that can actually produce a decision event, since an adjacent cat is a reflex that preempts the decision, and add a minimum-sample guard so an empty sample does not return a non-number. Specify a field-exclusion list for stream comparison so wall-clock latency does not defeat it. Scope NFR-004's resume clause to the engine given the same answers, and add a service-level statement that a resumed run may diverge, which is the honest claim.

Documents: requirements SM-03, SM-05, SM-06, SM-07, NFR-004; data model 7.1; technical specification 7.1 and 7.2.

### WP-10. Privacy and observability

Apply D-2 and D-3. Settle the address-hash question with a per-day salt and acknowledge in the data model that a hashed address is personal data, correcting the claim that five fields are the complete inventory.

Documents: technical specification 8; architecture 6; data model 3.1, 3.5, 13; compliance context; assumption register.

### WP-11. Document corrections

The medium and low findings, grouped so they can be done in one pass per document rather than one per finding: the personality requirement miscited in four places, the nine-candidate movement rule, the explore signal still described as a least-visited map, the three-bucket distance vocabulary the flagship metric cannot match, the two opposite baseline rules for suspect food, the usage table declared not-null while its prose says nullable, the chunk narrative missing the byte cap, the chart count, the price field's home, the export progress unit, the Neon-outage buffer that nothing allocates, the anonymous retention deadline a daily sweep cannot meet, the GlobalBudget and GlobalLimits split naming, the four meanings of snapshot, the serialize and restore pair missing from two export lists, and the two decision records still arguing for the superseded browser shape.

## 3. Sequence

1. **Decide.** D-1 through D-4. Everything in WP-1, WP-7, WP-9, and WP-10 waits on one of them.
2. **Start now, in parallel.** WP-2, WP-4, WP-5, WP-6, WP-8, WP-11. None needs a decision, and WP-2 and WP-4 are the two that get structurally harder the later they are left.
3. **Then.** WP-1 and WP-7 after D-1, since WP-7's anonymous binding depends on how the budget is shared. WP-3 alongside. WP-9 after D-4, WP-10 after D-2 and D-3.
4. **Re-validate.** Re-run the validation against the corrected set. The three audit passes are cheap to repeat and the point of the exercise is that the second run should be quiet.
5. **Then implement**, following the twelve-stage sequence already in the technical specification, whose stage 3 gate, an invisible snapshot round trip, now also covers the fear test from WP-5 and the streaming metrics from WP-4.

## 4. What this does not change

The requirements, the flows, and the wireframes are structurally correct and none is being rewritten. The engine mechanics, the tick model, the mousehole design, the personality model, the memory and alarm rules, and the decision contract's wording all stand. The stack, the platform, the storage split, and the repository layout stand. What changes is how batching groups mice, who holds storage credentials, where the viewer's first frame comes from, how the summary is stored, one line of the danger formula, and about forty pieces of wording.
