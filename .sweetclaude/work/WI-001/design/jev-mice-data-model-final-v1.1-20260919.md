---
title: jev-mice Data Model
version: 1.1
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: minor. Applies the solution validation remediation: per-chunk summary segments replacing the rewritten whole-run object, the snapshot's whole-series tail removed, a per-account session index, spawn and resume events, error and timing columns, the anonymous address binding, the shared request budget, and the usage-row and address-hash corrections. Approved as final by Carson Sweet on 2026-09-19.
previous_file: jev-mice-data-model-superseded-v1.0-20260919.md
---

# jev-mice Data Model

**Version:** 1.1 (final)

**Date:** 2026-09-19

**Work item:** WI-001

**Sources:** Architecture v2.1 (final) for the four stores and their roles; User flows v1.0 (final) for what each screen must read and write; Requirements v2.1 (final) for the simulation's own shapes.

## 1. What lives where

Four stores, each chosen for one job. Nothing is duplicated between them except by deliberate cache.

| Store | Holds | Authority for |
|---|---|---|
| Neon Postgres | users, runs, chunk index, share tokens, usage history, pending object deletions | Everything a query has to filter, sort, or join. The durable record of who owns what. |
| Cloudflare R2 | run chunks, summary series, snapshots | Bulk simulation output. Written once, read by range. |
| Cloudflare KV | sessions | Fast session lookup on every request, with expiry as a property of the store. |
| Durable Object storage | run cursor and allowance, per-subject daily counters, global counters and queue | Live coordination and exact counting. Small, hot, single-threaded. |

**The dividing line between Postgres and Durable Objects.** A Durable Object is the authority while something is happening: it decides whether a chunk may spend tokens and which queued run starts next. Postgres is the authority afterwards: it holds the history that survives the object being evicted. Every allowance a Durable Object grants produces a usage row; the object is the gate, the table is the ledger.

## 2. Entities and relationships

```
                 +---------+
                 |  users  |
                 +---------+
                      | 1
                      | owns (cascade)
                      v *
  +--------------------------------------+
  |                runs                  |<-----+
  |  owner is exactly one of:            |      |
  |    owner_user_id -> users            |      | 1
  |    owner_anon_id -> signed cookie    |      |
  +--------------------------------------+      |
       | 1            | 1            | 1        |
       | (cascade)    | (cascade)    | (cascade)|
       v *            v *            v *        |
  +-----------+  +--------------+  +-----------+|
  |run_chunks |  | share_tokens |  | jev_usage ||
  +-----------+  +--------------+  +-----------+|
       |               |                        |
       | object_key    | (viewer holds token)---+
       v
  R2: runs/{id}/chunks/{seq}.json.gz
      runs/{id}/summary.json.gz
      runs/{id}/snapshot.json.gz
                                 +---------------------------+
                                 | pending_object_deletions  |
                                 |  (no FK; outlives its run)|
                                 +---------------------------+
```

**users has many runs**, cascading on delete. A user row is the only place personal data lives.

**A run's owner is exactly one of** a user or an anonymous cookie id, enforced by a check constraint. Anonymous subjects get no table: the cookie is HMAC-signed and self-describing, so there is nothing to store about them and nothing to clean up but their runs.

**runs has many run_chunks, share_tokens, and jev_usage rows**, all cascading. A run is the unit of ownership, sharing, retention, and deletion.

**pending_object_deletions has no foreign key** on purpose: it exists to finish removing objects whose run row is already gone.

## 3. Postgres schema

Drizzle definitions follow; the notes after each table explain anything the types do not say. Timestamps are `timestamptz` throughout and the application never writes local time.

```ts
// packages/.../schema.ts  (apps/worker/src/db/schema.ts)
import { pgTable, pgEnum, uuid, text, integer, bigint, boolean,
         timestamp, jsonb, bytea, index, uniqueIndex, primaryKey,
         check, bigserial } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const runStatus = pgEnum('run_status', [
  'queued', 'running', 'paused', 'completed', 'failed', 'cancelled',
])

export const subjectKind = pgEnum('subject_kind', ['user', 'anon', 'ip'])

export const deletionReason = pgEnum('deletion_reason', [
  'run_deleted', 'account_deleted', 'expired', 'run_failed_cleanup',
])
```

### 3.1 users

```ts
export const users = pgTable('users', {
  id:          uuid('id').primaryKey().defaultRandom(),
  googleSub:   text('google_sub').notNull().unique(),
  email:       text('email').notNull(),
  name:        text('name').notNull(),
  avatarUrl:   text('avatar_url'),
  isOwner:     boolean('is_owner').notNull().default(false),
  createdAt:   timestamp('created_at',    { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:  timestamp('last_seen_at',  { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('users_email_lower_idx').on(sql`lower(${t.email})`),
])
```

`google_sub` is the identity. Email, name, and avatar are refreshed from the token on every sign-in, because a person can change all three at Google and the app should follow. The case-insensitive unique index on email exists so the owner allowlist can be checked by email without a scan, and so two Google accounts cannot present the same address.

`is_owner` is recomputed at each sign-in from the OWNER_EMAILS setting and stored, so that authorization checks on later requests are a column read rather than a settings parse. Removing an address from the setting takes effect at that user's next sign-in; revoking immediately means also clearing the column.

These are the only fields describing a person's identity. One other piece of personal data exists, and naming it here is what makes the inventory honest: `runs.address_hash`, a salted hash of the network address a run was started from, kept only so the per-address budget can be enforced. The salt rotates daily, so a hash cannot be correlated across days, and the column is left null for signed-in runs, where the account already identifies the subject.

### 3.2 runs

```ts
export const runs = pgTable('runs', {
  id:            uuid('id').primaryKey().defaultRandom(),

  ownerUserId:   uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  ownerAnonId:   text('owner_anon_id'),

  name:          text('name').notNull(),
  status:        runStatus('status').notNull().default('queued'),

  config:        jsonb('config').notNull(),
  seed:          bigint('seed', { mode: 'number' }).notNull(),
  configHash:    text('config_hash').notNull(),

  preset:        text('preset').notNull(),
  totalTicks:    integer('total_ticks').notNull(),
  jevEnabled:    boolean('jev_enabled').notNull(),

  engineVersion: text('engine_version').notNull(),
  jevModel:      text('jev_model'),

  currentTick:   integer('current_tick').notNull().default(0),
  chunkCount:    integer('chunk_count').notNull().default(0),

  requests:      integer('requests').notNull().default(0),
  inputTokens:   bigint('input_tokens', { mode: 'number' }).notNull().default(0),
  costMicros:    bigint('cost_micros',  { mode: 'number' }).notNull().default(0),
  pricePerMtokMicros: integer('price_per_mtok_micros').notNull(),
  fallbackCount: integer('fallback_count').notNull().default(0),
  rateLimitRefusals: integer('rate_limit_refusals').notNull().default(0),
  errorCount:    integer('error_count').notNull().default(0),
  activeSeconds: integer('active_seconds').notNull().default(0),
  decisionCount: integer('decision_count').notNull().default(0),
  addressHash:   text('address_hash'),

  countsAgainstActiveLimit: boolean('counts_against_active_limit').notNull().default(true),

  queuedAt:      timestamp('queued_at',  { withTimezone: true }).notNull().defaultNow(),
  startedAt:     timestamp('started_at', { withTimezone: true }),
  endedAt:       timestamp('ended_at',   { withTimezone: true }),
  failureReason: text('failure_reason'),
  expiresAt:     timestamp('expires_at', { withTimezone: true }),

  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('runs_exactly_one_owner',
    sql`(${t.ownerUserId} is null) <> (${t.ownerAnonId} is null)`),
  check('runs_tick_bounds',
    sql`${t.currentTick} >= 0 and ${t.currentTick} <= ${t.totalTicks}`),
  check('runs_failure_reason_only_when_failed',
    sql`(${t.status} = 'failed') = (${t.failureReason} is not null)`),

  uniqueIndex('runs_one_active_per_user')
    .on(t.ownerUserId)
    .where(sql`${t.ownerUserId} is not null
               and ${t.countsAgainstActiveLimit}
               and ${t.status} in ('queued','running','paused')`),
  uniqueIndex('runs_one_active_per_anon')
    .on(t.ownerAnonId)
    .where(sql`${t.ownerAnonId} is not null
               and ${t.status} in ('queued','running','paused')`),

  index('runs_user_recent_idx').on(t.ownerUserId, t.createdAt.desc()),
  index('runs_anon_recent_idx').on(t.ownerAnonId, t.createdAt.desc())
    .where(sql`${t.ownerAnonId} is not null`),
  index('runs_active_idx').on(t.status)
    .where(sql`${t.status} in ('queued','running','paused')`),
  index('runs_expiry_idx').on(t.expiresAt)
    .where(sql`${t.expiresAt} is not null`),
])
```

**One active run per subject is a database constraint, not a code convention.** The two partial unique indexes make a second concurrent start impossible even under a double-click or a race between two tabs. `counts_against_active_limit` is set false for allowlisted owners, which lifts the constraint for them without weakening it for anyone else. The global cap of twenty is a different kind of limit and lives in the Durable Object, because it is a counter rather than a uniqueness rule.

**`config` is jsonb, validated by the engine's own validator** before insert. Keeping it whole means adding a knob needs no migration and the comparison view can diff two configurations field by field in application code. `preset`, `total_ticks`, and `jev_enabled` are denormalized out of it because the library lists and filters on them.

**`config_hash`** is a stable hash of the canonicalized configuration. Two runs with the same hash and the same seed simulated the same world, which is what the baseline-twin comparison asserts and what lets the interface say so plainly.

**`seed`** is an unsigned 32-bit value carried as a JavaScript number, expanded by the engine into the generator's four words. `bigint` with `mode: 'number'` stores it without the round-tripping awkwardness of a native bigint.

**Cost is stored, not derived.** `price_per_mtok_micros` records the price in effect when the run executed, and `cost_micros` is `input_tokens * price / 1_000_000` in integer arithmetic. A later price change does not rewrite history. At the published rate the price column reads 42,000 and a fifty-cent run reads 500,000 micros.

**`expires_at` null means never.** It is null for allowlisted owners, `created_at + 24 hours` for anonymous runs, and `created_at + 30 days` for everyone else. The interface shows an expiry badge when a run is within seven days of a non-null expiry.

**`current_tick` is the last tick written to a chunk**, not the tick the engine happens to be on. It only advances at a chunk boundary, which is exactly what resume needs: restarting from `current_tick + 1` never replays or skips a tick.

### 3.3 run_chunks

```ts
export const runChunks = pgTable('run_chunks', {
  runId:      uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  seq:        integer('seq').notNull(),
  firstTick:  integer('first_tick').notNull(),
  lastTick:   integer('last_tick').notNull(),
  eventCount: integer('event_count').notNull(),
  bytesRaw:   integer('bytes_raw').notNull(),
  bytesGzip:  integer('bytes_gzip').notNull(),
  objectKey:  text('object_key').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.runId, t.seq] }),
  index('run_chunks_tick_idx').on(t.runId, t.lastTick),
  check('run_chunks_tick_order', sql`${t.firstTick} <= ${t.lastTick}`),
])
```

The index on `(run_id, last_tick)` answers the only question replay asks of this table: which chunk holds tick N. `select ... where run_id = $1 and last_tick >= $2 order by last_tick limit 1`. Scrubbing to an arbitrary tick is one index lookup and one object fetch.

`bytes_raw` and `bytes_gzip` are kept because the export screen has to tell a user how large a download will be before starting it, and because the ratio is worth watching as the event mix changes.

### 3.4 share_tokens

```ts
export const shareTokens = pgTable('share_tokens', {
  tokenHash:      bytea('token_hash').primaryKey(),
  runId:          uuid('run_id').notNull().references(() => runs.id, { onDelete: 'cascade' }),
  createdBy:      uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt:      timestamp('created_at',       { withTimezone: true }).notNull().defaultNow(),
  revokedAt:      timestamp('revoked_at',       { withTimezone: true }),
  lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
  accessCount:    integer('access_count').notNull().default(0),
}, (t) => [
  index('share_tokens_run_idx').on(t.runId),
])
```

**The token itself is never stored.** The primary key is the SHA-256 of the token; the plaintext exists only in the link the owner copies. A share token is a bearer credential, and a leaked database should not hand out working links. This tightens what the architecture's sharing decision described and costs one hash per lookup.

`revoked_at` rather than a delete, so that an owner who revokes a link and later wonders what happened can be told. Revoked rows disappear with the run.

`access_count` and `last_accessed_at` are the only telemetry on sharing, and they describe the link, not the viewer. No address, agent string, or identifier of the person following the link is recorded.

### 3.5 jev_usage

```ts
export const jevUsage = pgTable('jev_usage', {
  id:           bigserial('id', { mode: 'number' }).primaryKey(),
  runId:        uuid('run_id').references(() => runs.id, { onDelete: 'cascade' }),
  chunkSeq:     integer('chunk_seq'),
  subjectKind:  subjectKind('subject_kind').notNull(),
  subjectKey:   text('subject_key').notNull(),
  requests:     integer('requests').notNull(),
  inputTokens:  bigint('input_tokens', { mode: 'number' }).notNull(),
  costMicros:   bigint('cost_micros',  { mode: 'number' }).notNull(),
  fallbacks:    integer('fallbacks').notNull().default(0),
  jevModel:     text('jev_model'),
  recordedAt:   timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('jev_usage_subject_day_idx').on(t.subjectKey, t.recordedAt.desc()),
  index('jev_usage_run_idx').on(t.runId),
])
```

One row per chunk, not per call. At 250-tick chunks a long run produces eighty rows rather than tens of thousands, and the numbers come from the SDK's own usage field rather than an estimate.

`subject_key` is `user:{uuid}`, `anon:{cookie id}`, or `ip:{hash}`, matching the Durable Object naming exactly so the ledger and the gate can be reconciled. Addresses appear only as a salted hash and only for rate limiting.

`run_id` is not null and cascades, so a usage row goes with its run. The day's enforcement does not depend on these rows: the quota counters are the authority while a day is open and this table is the durable ledger afterwards. Removing a swept run's rows is also what FR-126 requires, since a row carrying `anon:{cookie id}` would otherwise outlive the anonymous run it describes.

### 3.6 pending_object_deletions

```ts
export const pendingObjectDeletions = pgTable('pending_object_deletions', {
  id:         bigserial('id', { mode: 'number' }).primaryKey(),
  objectKey:  text('object_key').notNull(),
  reason:     deletionReason('reason').notNull(),
  attempts:   integer('attempts').notNull().default(0),
  lastError:  text('last_error'),
  createdAt:  timestamp('created_at',   { withTimezone: true }).notNull().defaultNow(),
  nextTryAt:  timestamp('next_try_at',  { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('pending_deletions_due_idx').on(t.nextTryAt),
])
```

This table is what makes deletion honest across two stores. Rows in Postgres vanish in one transaction; objects in R2 are removed afterwards, and anything that fails is retried here with backoff until it succeeds. Without it, a storage hiccup during a delete would leave objects nobody can find and nobody will ever remove.

## 4. R2 object layout

```
runs/{runId}/chunks/{seq}.json.gz       one per chunk, seq zero-padded to 6
runs/{runId}/summary/{seq}.json.gz      one segment per chunk, same tick range
runs/{runId}/snapshot.json.gz           replaced at every chunk boundary
runs/{runId}/export.tar                 built on demand, not retained
```

All three durable objects are gzip over JSON, written by the container with `CompressionStream` and read by the browser with `DecompressionStream`. No server-side decompression happens on the read path: chunks are streamed to the browser compressed and expanded there, which keeps the Worker's memory flat regardless of run size.

**Chunks and summary segments are immutable once written**, so both can carry a long immutable cache header. Only the snapshot is overwritten in place, and it is never served to a viewer. One exception is handled rather than asserted: a container that dies mid-chunk is replaced and rewrites the same sequence number, so a chunk key becomes immutable when the coordinator records its index row, and nothing serves a chunk before then.

**Deleting a run deletes the prefix.** Every object for a run sits under `runs/{runId}/`, so deletion is a prefix listing and a batch delete and there is no way to miss one. Only the Worker holds a credential that can list or delete. A container holds no storage credential at all and is handed a presigned URL for each single object it writes.

## 5. KV

```
key    sess:{token}
value  { "userId": "<uuid>", "createdAt": "<iso8601>" }
ttl    30 days from issue, never extended

key    usess:{userId}:{token}
value  ""                        existence only; an index, not a record
ttl    the same 30 days
```

Sessions are the only KV use. The token is 256 bits from `crypto.getRandomValues`, and the key is the token itself rather than a hash, because KV keys are not enumerable and the value carries nothing an attacker could not obtain with the token anyway.

The second key is an index, and it exists because deletion needs it. Listing the `usess:{userId}:` prefix gives every live session of an account, which is what lets signing out everywhere and deleting an account invalidate sessions on other devices. Without it the only reachable session is the one making the request, and FR-132 could not be met.

The lifetime is absolute, not sliding: thirty days from issue, never extended on use, matching FR-078. A session middleware that finds no matching user row treats the session as invalid and clears it, so a session outliving a deleted account fails closed.

**Anonymous visitors have no KV entry.** Their cookie is `anon:{id}.{hmac}`, verified with the signing key on each request. There is nothing to store and nothing to expire; the cookie's own lifetime is the session.

## 6. Durable Object storage

Three classes. Each holds a handful of small keys and is authoritative only while it is warm; every fact that must outlive eviction is mirrored into Postgres at a chunk boundary.

### 6.1 Run, one per run, named by run id

| Key | Shape | Purpose |
|---|---|---|
| `meta` | `{ runId, ownerKey, status, totalTicks, configHash, containerId, callbackToken }` | Identity and authorization for the container's callbacks |
| `cursor` | `{ currentTick, nextChunkSeq, lastSnapshotKey, lastChunkAt }` | Where the run is; what resume restores from |
| `allowance` | `{ granted, spent, deniedAt, degraded }` | The current chunk's token allowance and whether decisions have fallen back |
| `control` | `{ desired: 'run' \| 'pause' \| 'step' \| 'stop', speed, seq }` | Commands from viewers, pushed to the container immediately; `seq` lets the container ignore a stale push |
| `presigned` | `{ chunk, summary, snapshot, expiresAt }` | The single-object upload URLs issued for the next boundary |
| `lastFrame` | `{ tick, payload, at }` | The most recent broadcast frame, for a connecting viewer |

Viewer WebSockets are held as hibernatable attachments rather than storage keys, so an idle run with watchers costs nothing while no frames are flowing.

`callbackToken` is generated afresh at every container start, including a restart after a watchdog timeout, so a process the system has replaced cannot report into its replacement's run. Alongside it the object holds `presigned`, the three single-object upload URLs it issued for the next boundary, and `lastFrame`, the most recent frame it broadcast, kept only while a viewer is attached and used to answer a connecting viewer without waking the container.

### 6.2 QuotaCounter, one per subject, named by subject key

| Key | Shape |
|---|---|
| `day` | `'YYYY-MM-DD'` in UTC |
| `usage` | `{ tokens, requests, reserved }` |

An alarm at the next UTC midnight resets `usage` and advances `day`. Reservation and commitment are the two operations: a chunk reserves its estimate, the container reports actual usage, and the difference is returned. Because the object is single-threaded, no reservation can race another.

### 6.3 GlobalLimits, singleton

| Key | Shape |
|---|---|
| `day` | `'YYYY-MM-DD'` in UTC |
| `budget` | `{ costMicros, reservedMicros }` |
| `capacity` | `{ activeRuns }` |
| `rate` | `{ budgetRpm, leased, holders }` |
| `queue` | ordered array of `{ runId, subjectKey, enqueuedAt }` |

**Naming note.** The architecture called this object GlobalLimits. It also has to hold the global active-run count and the queue, because a run's start needs both answers and two singletons would mean two round trips and a race between them. The name GlobalLimits replaces GlobalLimits wherever that appears in the decision records.

The queue is an array rather than a table because it is short by construction: it only exists when twenty containers are already running, and a queued run's position is its index.

`rate` is what makes FR-073 enforceable. The object holds one deployment-wide request-per-minute budget, below the published limit, and leases a share of it to each running simulation at every chunk boundary. A simulation must hold a lease to issue requests and may not exceed it, so the deployment cannot breach the published limit however many runs are active. When leases are divided among many runs each one ticks more slowly, which is the intended behaviour rather than a failure.

## 7. Engine types

These live in `packages/engine` and are imported by the container, the Worker, and the browser. They are as much a part of the data model as the tables, because they define the bytes in R2.

### 7.1 Events

```ts
type Tick = number
type AgentId = string          // 'm17' mouse, 'c3' cat
type Bearing = 'north' | 'northeast' | 'east' | 'southeast'
              | 'south' | 'southwest' | 'west' | 'northwest'

interface EventBase { tick: Tick; seq: number }

type SimEvent =
  | (EventBase & { kind: 'run_started';   config: RunConfig; seed: number;
                    engineVersion: string })
  | (EventBase & { kind: 'mouse_spawned'; id: AgentId; sex: Sex;
                    personality: Personality })
  | (EventBase & { kind: 'run_resumed';   fromTick: Tick; attempt: number })
  | (EventBase & { kind: 'tick_advanced'; population: number })
  | (EventBase & { kind: 'moved';         id: AgentId; from: Cell; to: Cell })
  | (EventBase & { kind: 'decision_requested'; batchId: string;
                    agents: AgentId[]; tile: [number, number] })
  | (EventBase & { kind: 'decision_returned';  batchId: string;
                    source: 'jev' | 'baseline'; latencyMs: number;
                    model?: string; inputTokens?: number;
                    subjects: DecisionSubject[] })
  | (EventBase & { kind: 'decision_fallback';  batchId: string;
                    reason: 'timeout' | 'error' | 'quota' | 'disabled';
                    detail?: string })
  | (EventBase & { kind: 'food_eaten';      id: AgentId; foodId: string })
  | (EventBase & { kind: 'food_respawned';  foodId: string; at: Cell })
  | (EventBase & { kind: 'trap_entered';    id: AgentId; trapId: string })
  | (EventBase & { kind: 'evasion_rolled';  id: AgentId; trapId: string;
                    nutrition: number; chance: number; evaded: boolean })
  | (EventBase & { kind: 'mouse_trapped';   id: AgentId; trapId: string })
  | (EventBase & { kind: 'trap_respawned';  trapId: string; at: Cell })
  | (EventBase & { kind: 'hole_entered';    id: AgentId; holeId: string;
                    as: 'adult' | 'brood' })
  | (EventBase & { kind: 'hole_left';       id: AgentId; holeId: string })
  | (EventBase & { kind: 'brood_born';      holeId: string; motherId: AgentId;
                    pups: AgentId[] })
  | (EventBase & { kind: 'hole_freed';      holeId: string })
  | (EventBase & { kind: 'cat_targeted';    id: AgentId; target: AgentId | null;
                    mode: CatMode })
  | (EventBase & { kind: 'cat_pounced';     id: AgentId; target: AgentId;
                    from: Cell; to: Cell })
  | (EventBase & { kind: 'capture';         catId: AgentId; mouseId: AgentId })
  | (EventBase & { kind: 'cat_eating_started'; id: AgentId })
  | (EventBase & { kind: 'cat_eating_ended';   id: AgentId })
  | (EventBase & { kind: 'mating';          a: AgentId; b: AgentId; holeId: string })
  | (EventBase & { kind: 'gestation_started'; id: AgentId })
  | (EventBase & { kind: 'birth';           motherId: AgentId; pupId: AgentId;
                    personality: Personality; sex: Sex })
  | (EventBase & { kind: 'cap_limited_birth'; motherId: AgentId; lost: number })
  | (EventBase & { kind: 'death';           id: AgentId;
                    cause: 'starvation' | 'trap' | 'cat' })
  | (EventBase & { kind: 'memory_added';    id: AgentId; sentence: string;
                    provenance: 'seen' | 'heard'; bearing: Bearing })
  | (EventBase & { kind: 'alarm_exchanged'; from: AgentId; to: AgentId;
                    sentence: string })
  | (EventBase & { kind: 'run_ended';       reason: 'completed' | 'cancelled' | 'failed';
                    finalTick: Tick })

interface DecisionSubject {
  agentId:       AgentId
  state:         Record<string, unknown>        // exactly what was sent
  questions:     Record<string, QuestionSpec>   // exactly what was asked
  answers:       Record<string, AnswerPayload>  // exactly what came back
  intent:        DriveLabel
  lowConfidence: boolean
  fear:          FearLevel
  weights:       Record<SignalField, number>
}
```

**Field names are readable rather than abbreviated.** Gzip removes nearly all the cost of repeated keys, so the only real effect of longer names is that a chunk reaches the eight-megabyte raw cap slightly sooner and flushes at fewer ticks. For a product whose point is that anyone can read what happened, legible events are worth a few more objects.

**`death` carries exactly one cause**, which the type enforces rather than a validator checking after the fact.

**`mouse_spawned` exists so the starting cohort is recorded rather than assumed.** Without it the personality-mix check can only read births and has to take the initial draw from the configured percentages, which is the thing it is supposed to be testing.

**`latencyMs` and any other wall-clock field are excluded from stream comparison** by a declared list the replay test uses, because they differ on every re-simulation and would otherwise make an exact comparison impossible.

**`decision_returned` is the large event** and the reason chunks are capped by bytes as well as by ticks. It preserves the request and the response verbatim, because the inspector's promise is that nothing was reworded between the API and the screen.

### 7.2 Chunk

```ts
interface Chunk {
  runId:         string
  seq:           number
  firstTick:     Tick
  lastTick:      Tick
  engineVersion: string
  events:        SimEvent[]
}
```

### 7.3 Summary series

```ts
interface SummarySegment {
  runId:      string
  seq:        number          // matches its chunk
  fromTick:   Tick            // first tick of this chunk
  toTick:     Tick            // last tick of this chunk
  length:     number
  series: {
    miceTotal:      number[]
    miceMale:       number[]
    miceFemale:     number[]
    miceBold:       number[]
    miceCautious:   number[]
    miceVigilant:   number[]
    miceSocial:     number[]
    miceInHoles:    number[]
    deathsStarvation: number[]   // cumulative
    deathsTrap:       number[]
    deathsCat:        number[]
    births:           number[]
    meanNutrition:    number[]
    meanFear:         number[]   // 0..3 over the four levels
    decisions:        number[]   // per tick
    inputTokens:      number[]   // cumulative
    costMicros:       number[]   // cumulative
  }
}
```

**Columnar, not one object per tick.** Parallel arrays gzip far better than repeated keys, and they are the shape uPlot already wants, so the chart path has no transformation step.

**One segment per chunk, never rewritten.** An earlier version kept a single object covering tick zero to now and rewrote it at every boundary, which forced the container to hold the whole series for the life of a run and made bytes written grow with the square of its length. A segment covers only its own chunk's ticks, so memory is flat and writes are linear. A reader wanting the whole run fetches the segments and concatenates; at twenty thousand ticks that is eighty small objects totalling well under a megabyte compressed.

The comparison view reads only these segments for each run, never a chunk, which is what makes overlaying two long runs quick.

### 7.4 Snapshot

```ts
interface Snapshot {
  version:       1
  runId:         string
  engineVersion: string
  tick:          Tick            // equals the chunk's lastTick
  nextSeq:       number          // next event sequence number
  rng:           [number, number, number, number]
  mice:          MouseState[]    // position, sex, personality, nutrition, age,
                                 // memories, intent, intentAge, pregnancy, holeId
  cats:          CatState[]      // position, mode, target, cooldown, patience,
                                 // lastSighting
  food:          FoodState[]     // position, present, respawnAt
  traps:         TrapState[]     // position, occupantId, respawnAt
  holes:         HoleState[]     // position, occupancy
  summaryTail:   SummarySegment  // only the current chunk's segment
}
```

**The snapshot is the strongest test fixture in the project.** Running five hundred ticks straight must produce the same events as running two hundred fifty, serializing, restoring, and running two hundred fifty more. If any piece of state is missed here, that test fails, which is why resume and determinism are one problem rather than two.

`version` is present from the first release so a later engine can refuse or migrate an incompatible snapshot rather than resuming into nonsense.

The snapshot carries only the current chunk's summary segment, not the run's whole series. Earlier segments are already written and immutable, so a resumed container needs nothing but the one it was part way through.

## 8. Lifecycle and retention

**Run status transitions.** Any other transition is a bug.

```
  queued ---> running ---> paused ---> running
    |            |                        |
    |            +--> completed           |
    |            +--> failed <------------+
    +--> cancelled <--------------------- +
```

**Expiry is set once, at creation**, from the owner's kind: null for allowlisted owners, twenty-four hours for anonymous runs, thirty days for everyone else. A daily cron trigger selects runs past their expiry, and for each one deletes the R2 prefix, enqueues anything that fails into `pending_object_deletions`, and deletes the row, which cascades chunks, tokens, and the run link on usage rows.

**Because thirty days is short, export is a first-release feature, not a nicety.** The library shows an expiry badge inside the final seven days so nothing disappears unannounced.

## 9. Deletion semantics

Deleting a run: revoke tokens, delete the R2 prefix, delete the row in one statement; cascades remove chunks, tokens, and the usage link. Any object that fails to delete goes to the retry table.

Deleting an account is the same at larger scope, across four stores rather than two, with one honest qualification.

1. Verify R2 is reachable. If not, change nothing and tell the user to try again.
2. In one Postgres transaction, delete the user row. Cascades remove every run, chunk row, share token, and usage row.
3. Delete every session of that account, found by listing the `usess:{userId}:` index, and clear the cookie on this device.
4. Tell each of that account's run coordinators to terminate, and discard its quota counter, so no coordinator state outlives the account.
5. Delete each run's object prefix, enqueuing failures for retry.

From the user's point of view this is all-or-nothing: either nothing is removed, or the account and everything indexed under it are gone at once, with any stragglers in storage swept up afterwards. The flow's wording, that nothing is removed on partial failure, holds for step one, which is where a partial failure can realistically be caught. It is worth saying plainly that step four is eventually consistent rather than implying a guarantee the stores cannot give.

## 10. Query patterns

| Screen or job | Query | Index used |
|---|---|---|
| Run library | runs by owner, newest first | `runs_user_recent_idx` |
| Start a run | attempt insert; unique violation means a run is already active | `runs_one_active_per_user` |
| Capacity check | count active runs | GlobalLimits, not Postgres |
| Replay a tick | chunk containing tick N | `run_chunks_tick_idx` |
| Share page | run by token hash | `share_tokens` primary key |
| Account usage | today's usage for a subject | `jev_usage_subject_day_idx` |
| Retention sweep | runs past expiry | `runs_expiry_idx` |
| Sign out everywhere | sessions of one account | KV prefix `usess:{userId}:` |
| Estimate for a new run | recent runs' decisions, tokens and active time | `runs_user_recent_idx` |
| Deletion retries | due object deletions | `pending_deletions_due_idx` |

## 11. Migration strategy

This is a new schema, so the first migration creates everything and there is nothing to back-fill and nothing destructive. Migrations are Drizzle Kit files committed to the repository and applied against the Neon branch for the environment: `dev` during development, `staging` before release, `main` on deploy.

Two conventions worth fixing now, because retrofitting them is what makes later migrations painful. Every future change is expand-then-contract: add the new column or table, write to both, migrate readers, then drop the old one in a separate release. And the engine's event, chunk, summary, and snapshot types are versioned by `engineVersion` on the run and `version` on the snapshot, so a reader always knows whether it can interpret what it fetched.

Rollback for the first migration is dropping the schema, which is acceptable only before there is data. From the first real run onward, rollback means the previous release's code reading the current schema, which the expand-then-contract rule guarantees.

## 12. Changes to earlier documents

Share tokens are stored as SHA-256 hashes rather than as the tokens themselves. GlobalLimits becomes GlobalLimits and holds the budget, the active-run count, the queue and the shared request-rate budget. Account deletion is atomic in the index and eventually consistent in storage, with a retry table making the difference invisible. `pending_object_deletions` appears in no earlier document. One active run per subject is enforced by the database rather than by application code.

Added in version 1.1: a per-account session index, without which sessions on other devices cannot be revoked. Per-chunk summary segments in place of a rewritten whole-run object. A snapshot that carries only the current segment. Spawn and resume events. Error, refusal, timing and decision-count columns on a run, so the throughput and error metrics have fields to read. An address hash on a run, so an anonymous budget survives a cleared cookie, named openly as personal data. A request-rate budget in the limits object. Presigned upload URLs and a cached frame in the run coordinator.

## 13. Open questions

None. The three left open in version 1.0 are settled: usage rows go with their run, which FR-126 requires; address hashes are salted per day, which is what makes them uncorrelatable across days; and the summary is now segmented, so the question of whether it should be no longer arises.
