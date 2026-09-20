---
title: jev-mice API Design
version: 1.1
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: minor. Applies the solution validation remediation: presigned object URLs and no container storage credential, the full control vocabulary pushed immediately, a world-state endpoint, a shared request-rate lease, multi-subject quota reservation, summary segments, share routes for chunk lookup, and a complete authorization matrix. Approved as final by Carson Sweet on 2026-09-19.
previous_file: jev-mice-api-design-superseded-v1.0-20260919.md
---

# jev-mice API Design

**Version:** 1.1 (final)

**Date:** 2026-09-19

**Work item:** WI-001

**Sources:** Architecture v2.1 (final) for the components and their boundaries; User flows v1.0 (final) for what each screen calls; Data model v1.0 (draft) for the shapes that cross the wire.

**Scope.** Three interfaces: the public HTTP API the browser calls, the WebSocket the viewer holds open, and the private protocol between a simulation container and its Run object. The Durable Object method signatures are included because they are the contract between the Worker's routes and its coordinators.

## 1. Conventions

**Base path.** Everything public is under `/api`. Everything private to the system is under `/internal` and is unreachable from outside, enforced by a token check rather than by network topology.

**Authentication.** A session cookie named `jm_session` carrying an opaque token, or, in public mode, `jm_anon` carrying `id.hmac`. Both are HttpOnly, Secure, SameSite=Lax. The API accepts no other credential; there are no API keys for callers.

**Content types.** JSON in and out, except chunk, summary, snapshot, and export responses, which are `application/gzip` or `application/x-tar` streamed to the client without server-side decompression.

**Errors.** One envelope, always, with a stable machine code and a sentence a person can read.

```json
{ "error": { "code": "run_active", "message": "You already have a run in progress.",
             "detail": { "runId": "..." } } }
```

**Idempotency.** Creating a run relies on the database's one-active-run constraint rather than an idempotency key: a duplicate submission hits the unique index and returns `run_active` with the existing run's id, which is the answer the interface wants anyway.

**Versioning.** No version in the path. The browser and the API ship together from one repository and one deploy, so they are never out of step. The engine's own formats carry versions because they outlive a deploy in storage; routes do not.

**Time and numbers.** All timestamps are ISO 8601 in UTC. Money is integer micros of a dollar. Tokens and ticks are integers. Nothing on the wire is a float except the probabilities Jev returned, which are passed through unchanged.

## 2. Authentication

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/google` | Begin sign-in. Redirects to Google. Accepts `next` only when it begins with a single slash, does not begin with two, and contains no scheme or authority; anything else is ignored rather than followed. |
| GET | `/api/auth/google/callback` | Google returns here. Creates or updates the user, creates a session, sets the cookie, redirects to `next` or the library. |
| POST | `/api/auth/signout` | Deletes the session from storage and clears the cookie. Always 204, even with no session. |

The middleware handles state and the token exchange. The callback's only application logic is the user upsert, the owner-allowlist check, and session creation.

When authentication is switched off, `/api/auth/google` returns `404 auth_disabled`. Nothing in the interface links to it in that mode.

## 3. Session, quota, configuration

### GET /api/me

Returns who the caller is and what they may do. The browser calls it once at load and after sign-in.

```json
{ "subject": { "kind": "user", "id": "8f3c...", "email": "cs@example.com",
               "name": "Carson Sweet", "avatarUrl": "https://...", "isOwner": true },
  "mode":    { "authRequired": true, "jevEnabled": true },
  "quota":   { "tokensRemaining": 21400000, "tokensLimit": 25000000,
               "costMicrosToday": 151200, "resetsAt": "2026-09-20T00:00:00Z",
               "unlimited": false },
  "capacity":{ "activeRuns": 1, "activeRunId": "b12e...", "globalActive": 7,
               "globalLimit": 20 } }
```

For an anonymous caller `subject.kind` is `"anon"`, `id` is the cookie id, and the personal fields are absent. For an allowlisted owner `quota.unlimited` is true and the remaining figures are omitted rather than set to a sentinel.

### GET /api/quota

The same `quota` and `capacity` blocks alone, for the header's budget indicator to poll cheaply.

### POST /api/config/validate

Takes a candidate configuration, returns the engine validator's verdict plus the derived caps and the cost and duration estimates the configure screen shows.

```json
{ "valid": false,
  "errors":    [ { "field": "mice.female", "code": "above_cap",
                   "message": "Medium allows 160 mice in total.", "cap": 160 } ],
  "caps":      { "mice": 160, "food": 80, "traps": 40, "cats": 10, "holes": 80 },
  "estimate":  { "decisions": 14800, "inputTokens": 8900000,
                 "costMicros": 373800, "wallClockSeconds": 940,
                 "basis": "measured median latency over the last 100 runs" } }
```

Validation is the engine's, imported by the Worker, so the screen and the simulation can never disagree about what is legal. The estimate is explicitly labelled with its basis, because it is a projection and the interface says so.

## 4. Runs

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/runs` | Create and start, or queue |
| GET | `/api/runs` | The caller's library |
| GET | `/api/runs/:id` | One run's detail |
| PATCH | `/api/runs/:id` | Rename |
| DELETE | `/api/runs/:id` | Delete run, chunks, tokens, objects |
| POST | `/api/runs/:id/control` | Pause, resume, step, speed, stop |

### POST /api/runs

Body is `{ "name"?: string, "config": RunConfig, "seed"?: number, "jevEnabled": boolean }`. A missing seed is generated and returned.

Responses:

| Status | Body | Meaning |
|---|---|---|
| 201 | `{ run }` with `status: "running"` | Container starting; open the stream |
| 202 | `{ run, queue: { position: 3 } }` with `status: "queued"` | Global capacity full |
| 409 | `error.code: "run_active"`, `detail.runId` | The caller already has one |
| 402 | `error.code: "quota_exhausted"`, `detail: { tokensRemaining, estimate, maxTicksThatFit }` | The estimate exceeds the remaining budget |
| 422 | `error.code: "config_invalid"`, `detail.errors[]` | Validator rejected it |

The 402 carries `maxTicksThatFit` so the interface can offer to trim the run rather than only refusing it, which is what the configure flow promises. A caller who would rather run without Jev resubmits with `jevEnabled: false`, which skips the quota check entirely.

### GET /api/runs

`?status=&limit=&cursor=` with keyset pagination on `(created_at, id)`. Returns list rows, not configurations.

```json
{ "runs": [ { "id": "b12e...", "name": "Bold 70%", "status": "completed",
              "preset": "medium", "jevEnabled": true,
              "currentTick": 2000, "totalTicks": 2000, "chunkCount": 8,
              "costMicros": 373800, "fallbackCount": 0,
              "createdAt": "...", "endedAt": "...",
              "expiresAt": "2026-10-19T...", "expiringSoon": false } ],
  "nextCursor": null }
```

### GET /api/runs/:id

The list row plus the full configuration, the seed, the config hash, the engine and model versions, the chunk index, and the share links the owner has created.

### POST /api/runs/:id/control

Body `{ "action": "pause" | "resume" | "step" | "stop", "speed"?: number }`. Returns the resulting status. Only the owner may call it; a share viewer receives 403. Stopping is terminal and the response says so.

### DELETE /api/runs/:id

Revokes tokens, removes the object prefix, deletes the row. Returns `{ "deleted": { "runId", "chunks": 8, "shareLinks": 1, "bytes": 41203884 } }`. Objects that fail to delete are queued for retry and the response is still a success, because the row is gone and the user's view of the world is correct.

## 5. Record access

| Method | Path | Returns |
|---|---|---|
| GET | `/api/runs/:id/summary` | JSON index of summary segments |
| GET | `/api/runs/:id/summary/:seq` | `application/gzip`, one summary segment |
| GET | `/api/runs/:id/chunks` | JSON chunk index |
| GET | `/api/runs/:id/chunks/:seq` | `application/gzip`, one chunk |
| GET | `/api/runs/:id/chunks/at/:tick` | 302 to the chunk containing that tick |
| GET | `/api/runs/:id/export` | `application/x-tar`, the whole record |

Chunks and summary segments are immutable, so both carry `Cache-Control: private, max-age=31536000, immutable` and an ETag. Only the snapshot is mutable, and it is never served on a public route. This is what lets replay scrub backwards without refetching anything.

`chunks/at/:tick` exists so the browser never needs the index to jump to a tick. It redirects to this service's own `chunks/:seq` route, never to a storage URL, because a storage URL would grant access on possession alone and outlive both revocation and deletion.

Export streams a tar assembled on the fly from the objects, never buffered. The response sets `Content-Disposition` and, when the size is known from the chunk index, `Content-Length`, so the browser can show real progress.

## 6. Sharing

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/runs/:id/share` | Create a link. Returns the token once, in the clear. |
| GET | `/api/runs/:id/share` | List this run's links with created, revoked, and access count. |
| DELETE | `/api/runs/:id/share/:tokenId` | Revoke. |
| GET | `/api/share/:token` | Public read-only view of the run. |
| GET | `/api/share/:token/summary` | As above, by token. |
| GET | `/api/share/:token/summary/:seq` | As above, by token. |
| GET | `/api/share/:token/chunks` | Chunk index, by token. |
| GET | `/api/share/:token/chunks/at/:tick` | Chunk lookup by tick, by token. |
| GET | `/api/share/:token/chunks/:seq` | As above, by token. |
| GET | `/api/share/:token/stream` | WebSocket, read-only. |

The token appears in a response body exactly once, when it is created. Afterwards only its hash exists, so the list route shows a prefix for recognition and never the whole thing. An owner who loses a link revokes it and makes another.

A revoked, deleted or expired target returns `404 share_not_found` with no distinction between the cases, so a token cannot be used to probe what exists. A share holder reaches the same record routes an owner does, including the chunk index and the lookup by tick, because replay needs both; everything under a share token is read-only.

Share routes are unavailable in public mode: `POST` returns `403 sharing_disabled`.

## 7. Account

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/account` | Profile, usage today, run count, bytes stored |
| GET | `/api/account/export` | JSON of profile, run metadata, usage rows |
| DELETE | `/api/account` | Delete everything |

`DELETE /api/account` requires `{ "confirm": "DELETE" }` in the body, matching what the interface asks the user to type. It checks storage reachability first and returns `503 storage_unavailable` without changing anything if that check fails. On success it returns a summary of what was removed and clears the session cookie.

## 8. Viewer WebSocket

`GET /api/runs/:id/stream` and `GET /api/share/:token/stream`, upgraded. The Worker authorizes the request, then hands the socket to the run's Run object, which owns it from then on. Sockets use hibernation, so a run with watchers and no frames in flight costs nothing.

### Server to client

```ts
type ServerMessage =
  | { t: 'hello';    runId: string; status: RunStatus; totalTicks: number
      currentTick: number; canControl: boolean; config: RunConfig }
  | { t: 'snapshot'; tick: number; grid: GridDims
      mice: PackedMice; cats: PackedCats
      food: PackedFood; traps: PackedTraps; holes: PackedHoles }
  | { t: 'frame';    tick: number; moved: PackedMoves; changed: PackedChanges
      meter: { tps: number; requests: number; inputTokens: number
               costMicros: number } }
  | { t: 'status';   status: RunStatus; reason?: string; finalTick?: number }
  | { t: 'banner';   id: string; level: 'info' | 'warn'
      text: string; sinceTick?: number }
  | { t: 'banner_clear'; id: string }
  | { t: 'queue';    position: number }
  | { t: 'inspect';  agentId: string; detail: InspectDetail }
  | { t: 'error';    code: string; message: string }
```

### Client to server

```ts
type ClientMessage =
  | { t: 'control'; action: 'pause' | 'resume' | 'step' | 'stop'; speed?: number }
  | { t: 'inspect'; agentId: string | null }
  | { t: 'resync' }
  | { t: 'ping' }
```

**A viewer always receives `hello` then `snapshot` before any frame**, whether it is the first connection, a reconnect, or a late join. There is no incremental catch-up path to get wrong: reconnecting is the same code as connecting.

**Frames are deltas against the last frame or snapshot**, packed positionally rather than as objects, because these are the only high-rate messages. A frame carries only entities that moved or changed state, so a quiet tick costs a few dozen bytes.

**`inspect` is a subscription, not a request.** Selecting an animal sends one `inspect` with its id; the object then pushes a fresh `inspect` whenever that animal's decision changes, until the viewer sends `inspect: null`.

**The opening `snapshot` comes from the running simulation.** The object answers from the last frame it broadcast when that is under a second old, and otherwise asks the container for its current world state. It is never read from stored data, which lags by up to a chunk.

**`resync` requests a fresh snapshot** and is what the client sends if it detects a gap in tick numbers. It is a safety valve, not a normal path.

**Share viewers get `canControl: false`** and any control message they send is answered with `error: forbidden`. The server does not rely on the client hiding buttons.

**Backpressure.** If a socket's buffered amount exceeds a threshold, frames for that socket are dropped rather than queued, and the next delivered frame is preceded by a `snapshot`. A slow viewer degrades to fewer updates; it never slows the run or the other viewers.

## 9. Container and Run object protocol

This is the private contract that makes server-side simulation work. The container never talks to the browser and never talks to Postgres; everything it reports goes to its own Run object, and everything it is told comes from there.

### 9.1 Trust and identity

At start the Run object generates a report token and passes it to the container with the run id, the configuration, the seed and the decision key. Every call the container makes carries that token, and the object rejects any call whose token is not the one it issued for the container currently running. The token is regenerated on every start, including a restart after a watchdog timeout, so a process the system has replaced cannot report into its replacement's run.

**A container holds no object-store credential at all.** The coordinator chooses every key and hands the container a presigned URL good for one object and a short window: three uploads for each boundary, and one download of the snapshot when a run is resuming. A container therefore cannot name a key, cannot reach an object it was not given, and cannot delete or list anything. This replaces the write-only credential of the previous version, which could not be scoped to a prefix and could not grant the read that resume needs.

### 9.2 Container to Run object

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/internal/runs/:id/ready` | `{ engineVersion, pid, resumedFromTick? }` | `{ control, allowance }` |
| POST | `/internal/runs/:id/chunk` | chunk report, below | `{ control, allowance }` |
| POST | `/internal/runs/:id/frames` | `{ frames: Frame[] }` | `204` |
| POST | `/internal/runs/:id/done` | `{ finalTick, totals }` | `204` |
| POST | `/internal/runs/:id/failed` | `{ atTick, reason, detail? }` | `204` |

**The chunk report is the heartbeat of the system.** It is the only call that must not be lost, and it carries everything that has to become durable, in one round trip that also returns everything the container needs to keep going.

```ts
// POST /internal/runs/:id/chunk
interface ChunkReport {
  seq:         number
  firstTick:   number
  lastTick:    number
  eventCount:  number
  bytesRaw:    number
  bytesGzip:   number
  // no keys: the coordinator chose them and presigned them
  usage: { requests: number; inputTokens: number
           fallbacks: number; model: string | null }
  totals: { currentTick: number; requests: number
            inputTokens: number; fallbackCount: number }
}

interface ChunkAck {
  control:   { desired: 'run' | 'pause' | 'step' | 'stop'
               speed: number; seq: number }
  allowance: { tokens: number; degraded: boolean
               reason?: 'quota' | 'address_quota' | 'global_budget' | 'disabled' }
  rate:      { requestsPerMinute: number }   // this run's lease, FR-073
  presigned: { chunk: string; summary: string; snapshot: string
               expiresAt: string }           // for the next boundary
}
```

**The container uploads its own objects through presigned URLs and reports sizes, not keys.** Megabytes never pass through the Worker or the object, so their memory stays flat no matter how large a run is, and because the container cannot name a key it cannot name someone else's. The order is strict: upload chunk, upload summary segment, upload snapshot, then report. A crash before the report leaves objects the next successful report or the retention sweep cleans up; a crash after it leaves a consistent record.

**The acknowledgement carries everything the container needs to continue**: the control state, the token allowance, this run's share of the deployment's request budget, and the presigned URLs for the next boundary. A steady-state run therefore makes one internal call per chunk. The request lease is what makes FR-073 enforceable: a container may not issue more requests per minute than it holds, and because every lease comes from one budget the deployment cannot breach the published limit however many runs are active.

**Frames are best effort.** `/frames` batches the deltas accumulated since the last post, and the object drops them if no viewer is connected. A failed frame post is logged and forgotten; it never retries, because a stale frame is worthless.

### 9.3 Run object to container

| Method | Path | Purpose |
|---|---|---|
| POST | `/control` | Push run, pause, step, stop or a speed change, applied at the next tick rather than the next chunk |
| GET | `/inspect/:agentId` | Current decision detail for one animal |
| GET | `/world` | Current world state, for a viewer that is connecting |
| GET | `/health` | Liveness for the object's watchdog |

Control is pushed rather than carried on the acknowledgement, because a chunk boundary can be two minutes away and a person who presses pause expects it to pause. The container applies a pushed command at its next tick and ignores one whose sequence number it has already seen. `step` advances exactly one tick from a paused state, which is why the container's vocabulary has to carry it rather than stopping at run, pause and stop.

`/world` exists because the coordinator holds no entity state and the stored snapshot lags by up to a chunk. It returns what a connecting viewer needs and nothing more.

**Watchdog.** The object sets an alarm for twice the expected chunk interval. If neither a chunk nor a health response has arrived by then it treats the container as dead, generates a fresh report token, presigns a read of the last snapshot, starts a replacement, and tells watchers the run is resuming. The old token stops working at that moment, so a container that revives cannot report into its replacement's run. Two consecutive failed resumes mark the run failed.

### 9.4 A chunk boundary, end to end

```
container: gzip chunk, summary segment, snapshot
container: PUT each through the presigned URL issued with the last acknowledgement
container -> object: POST /internal/runs/{id}/chunk  { sizes, counts, usage, totals }
  object: insert run_chunks row; update runs row; insert jev_usage row
  object: QuotaCounter.commit(subject, actual) for every applicable subject
  object: GlobalLimits.commit(costMicros); GlobalLimits.releaseRate(runId)
  object: for each applicable subject, QuotaCounter.reserve(next estimate)
            -> first refusal denies the allowance and names which subject refused
  object: GlobalLimits.leaseRate(runId) -> this run's share of the request budget
  object: presign the next chunk, summary and snapshot uploads
  object: write cursor { currentTick, nextChunkSeq, lastSnapshotKey }
object -> container: 200 { control, allowance, rate, presigned }
container: continue, or switch to code-only rules if allowance.degraded
```

Reservation happens after commitment in the same call, so a run can never spend an allowance it was not granted, and the unspent part of the previous estimate is returned before the next is taken. Every applicable budget is consulted, not just the subject's: an anonymous run is checked against both its session and the address it was started from, and the first refusal decides.

## 10. Durable Object interfaces

The Worker's routes call these directly; they are the internal seam between routing and coordination.

```ts
interface RunObject {
  start(input: { run: RunRow; callbackToken: string
                 resumeFromTick?: number }): Promise<{ status: RunStatus }>
  control(action: 'pause' | 'resume' | 'step' | 'stop'
          speed?: number): Promise<{ status: RunStatus }>
  attachViewer(ws: WebSocket, canControl: boolean): Promise<void>
  state(): Promise<{ status: RunStatus; currentTick: number
                     queuePosition?: number }>
  world(): Promise<WorldState>   // last broadcast frame, or a fetch from the container
  terminate(reason: 'deleted' | 'expired'): Promise<void>
}

interface QuotaCounterObject {
  peek(): Promise<{ tokens: number; requests: number
                    limit: number; resetsAt: string }>
  reserve(tokens: number): Promise<{ granted: boolean; tokens: number
                                     reason?: 'quota' }>
  // one instance per subject key; the caller consults every applicable
  // subject in turn and stops at the first refusal
  commit(actual: { tokens: number; requests: number }): Promise<void>
  release(tokens: number): Promise<void>
}

interface GlobalLimitsObject {
  admit(runId: string, subjectKey: string
        estimateMicros: number): Promise<{ admitted: boolean
                                           queuePosition?: number }>
  release(runId: string): Promise<{ startedNext?: string }>
  commit(costMicros: number): Promise<void>
  leaseRate(runId: string): Promise<{ requestsPerMinute: number }>
  releaseRate(runId: string): Promise<void>
  stats(): Promise<{ activeRuns: number; globalLimit: number
                     costMicrosToday: number; budgetMicros: number
                     queueLength: number; rateLeased: number
                     rateBudget: number }>
}
```

`release` returning `startedNext` is how the queue drains: finishing a run tells the limits object to admit the next one, and the object answers with whichever run it just started, so the Worker can wake that run's object without polling.

## 11. Authorization

| Route group | Owner | Other signed-in user | Share token holder | Anonymous creator | Anonymous other |
|---|---|---|---|---|---|
| Create run | yes | yes | n/a | yes | yes |
| Validate a configuration | yes | yes | yes | yes | yes |
| Read own library | yes | own only | no | single current run | no |
| Read run detail, summary index, summary segment, chunk index, chunk, chunk-by-tick | yes | no | yes, read-only | yes | no |
| Open the run stream | yes, with control | no | yes, without control | yes, with control | no |
| Open the share stream | n/a | n/a | yes, without control | n/a | n/a |
| Control run | yes | no | no | yes | no |
| Delete run | yes | no | no | yes | no |
| Create or revoke share | yes | no | no | no, disabled | no |
| Export run | yes | no | no | yes | no |
| Account routes | self | self | n/a | n/a | n/a |
| Internal routes | no | no | no | no | no |

Every run route resolves the run and compares its owner to the caller's subject before doing anything else, including the read routes and both socket upgrades. There is no route where ownership is implied by possession of an identifier. The socket upgrade additionally checks the request's origin, because a socket carries the same control authority as the control route and the cookie policy that protects the latter does not protect a handshake. A share token grants read only: a control message arriving on a share socket is answered with an error rather than relying on the client to hide the button.

## 12. Error codes

| Code | Status | Meaning |
|---|---|---|
| `unauthenticated` | 401 | No valid session where one is required |
| `forbidden` | 403 | Valid session, not permitted |
| `sharing_disabled` | 403 | Public mode |
| `auth_disabled` | 404 | Sign-in route in public mode |
| `not_found` | 404 | No such run, chunk, or account |
| `share_not_found` | 404 | Token unknown, revoked, or target gone |
| `run_active` | 409 | Caller already has a run in progress |
| `invalid_transition` | 409 | Control action not legal from the current status |
| `config_invalid` | 422 | Validator rejected the configuration |
| `quota_exhausted` | 402 | Estimate exceeds the remaining budget |
| `global_budget_exhausted` | 402 | Deployment budget spent for the day |
| `capacity_full` | 202 | Queued rather than refused |
| `storage_unavailable` | 503 | Object store unreachable; nothing changed |
| `container_start_failed` | 503 | Simulation could not be started |
| `rate_limited` | 429 | Too many API calls from one subject |
| `address_quota_exhausted` | 402 | The network address's daily budget is spent |
| `origin_rejected` | 403 | Socket upgrade from an origin that is not this app |

## 13. Changes to earlier documents

The container uploads through presigned URLs and holds no storage credential, which is what removes the unvalidated-key path entirely rather than adding a check for it. Control, the token allowance, this run's request-rate lease and the next presigned URLs all ride on the chunk acknowledgement, so steady state is one internal call per chunk; the push channel carries the whole control vocabulary including step, because a boundary can be two minutes away. A world-state endpoint exists so a connecting viewer has a source. Quota reservation consults every applicable subject and stops at the first refusal. Summary segments replace the single rewritten summary object. Share holders reach the chunk index and the lookup by tick, which replay needs. The authorization matrix now covers both sockets, the share sub-routes and configuration validation, and the socket upgrade checks its origin.

## 14. Open questions

Whether frames should move to a binary encoding. Measuring a Large run before optimizing is the proposal.

Whether the export archive should include the snapshot. Excluding it is the proposal, since it is a resume artifact rather than part of the record.

Whether a share link should carry a starting tick, so an owner can point someone at the moment a colony collapsed. Yes is the proposal, as a query parameter rather than a property of the token.
