---
title: jev-mice User Flows
version: 1.0
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: hybrid
nda: false
changes: approved as final by Carson Sweet on 2026-09-19; paragraph numbers removed; the four open questions adopted as proposed
previous_file: jev-mice-user-flows-deprecated-v1.0-20260919.md
---

# jev-mice User Flows

**Version:** 1.0 (final)

**Date:** 2026-09-19

**Work item:** WI-001

**Sources:** Architecture v2.1 (final) for screens, states, and limits; Requirements v2.1 (final) for configuration knobs, live view, inspector, charts, and comparison. Flows reference requirement IDs where one exists and the architecture where the requirement is still owed to the next revision.

**Reader note.** Each flow names who it is for (Carson testing Jev's limits, a TypeSafe evaluator, an emergence watcher, or a researcher), where it starts, each user action with the system's response, where it branches, what success looks like, and what goes wrong. Steps are numbered inside each flow so a step can be cited as F-04 step 3.

## Navigation map

```
                 +-----------+   auth required    +-------------+
  first visit -->| Sign-in   |------------------->| Run library |<---------+
                 +-----------+                    +-------------+          |
                       | auth off (anonymous)          |   |   |            |
                       v                               |   |   +--> Account (export, delete, sign out)
                 +-------------+   start               |   +------> Compare (two runs)
                 | Configure   |-----------+           +----------> Run detail
                 +-------------+           |                          |  replay / share / export
                                           v                          v
                                    +-------------+  completed  +-------------+
                                    | Live view   |------------>| Replay      |
                                    | inspector   |             | inspector   |
                                    | charts      |             | scrubber    |
                                    +-------------+             +-------------+
                                           ^                          ^
                              reconnect ---+        share link -------+  (read-only, no sign-in)
```

## F-01 Sign in with Google

For everyone when authentication is required. Entry point: any app URL without a session.

1. Visitor opens any app URL → server has no session cookie and AUTH_REQUIRED is on → sign-in page renders with one button, "Continue with Google", a one-paragraph description of what the app does, and a two-line privacy note: what is stored (Google id, email, name, avatar), how long runs are kept (30 days).
2. Visitor clicks the button → browser is sent to Google's consent screen requesting openid, email, and profile.
3. Visitor approves → Google returns to the callback → server creates or updates the user, creates a session, sets the cookie → browser lands on the run library, or on the URL originally requested if it was a run or share link the user may see.
   → If Google returns an error or the visitor cancels: sign-in page again with "Google sign-in did not complete. Try again." No account is created.
   → If the user record cannot be written (database unavailable): sign-in page with "Sign-in is temporarily unavailable." and nothing stored.

Success: run library with the user's avatar and name in the header, remaining daily Jev budget shown. Errors: the two above, both recoverable by retrying.

## F-02 Arrive in public mode

For anonymous visitors when authentication is off. Entry point: any app URL.

1. Visitor opens the app → server issues a signed anonymous cookie → configuration screen renders directly, with a dismissible notice: "You are running anonymously. Your run is kept for 24 hours and cannot be shared. Sign-in is disabled on this deployment."
2. Header shows an anonymous badge and the anonymous daily Jev budget remaining.

Success: configure screen ready. There is no library, no account screen, and no share action anywhere in the interface in this mode. Errors: none specific; quota states are covered in F-12.

## F-03 Configure and start a run

For the watcher and the researcher above all; Carson uses it to hit limits on purpose. Entry point: "New run" in the header or the library's empty state. Requirements FR-053 to FR-056, FR-003, FR-043.

1. User opens Configure → form renders with Medium defaults (FR-055): preset, tick count, seed (random, with a regenerate button and a lock toggle), male and female mice, cats, traps, food piles, mouseholes, food respawn, nutrition decay, four personality percentages with a live sum, Jev on or off, price per million tokens. A right-hand panel shows the derived caps for the preset and a cost estimate: expected Jev tokens and dollars for this configuration at the configured price.
2. User edits fields → inline validation on each change: values outside range or above a cap show the cap next to the field (FR-054); the personality sum shows red until it reads 100.
3. User clicks Import → file picker → configuration and seed load from JSON and validate as in step 2 (FR-056). User clicks Export → JSON downloads.
4. User clicks Start → server validates again, then checks in order:
   → Active-run limit: the user already has a run in progress → "You have a run in progress" with buttons Watch it, Stop it and start this one, Cancel.
   → Quota: the estimate exceeds the remaining daily budget → "This run would exceed today's Jev budget" with buttons Start in baseline mode, Reduce ticks to fit (fills the tick count that fits), Cancel.
   → Global capacity: 20 containers already active → run is created as queued → F-14.
   → Otherwise: run row created, container starting → live view opens with "Starting" until the first frame arrives.

Success: live view showing tick 0 and the first frames. Errors: validation messages inline; the three start-time checks each offer a way forward rather than a dead end; if the container fails to start within 30 seconds the run shows "Could not start. Try again." and the row is marked failed.

## F-04 Watch a live run

For everyone. Entry point: a run starting (F-03), the library's Open on a running run, or a reconnect. Requirements FR-064, FR-066 to FR-068.

1. Live view opens → WebSocket connects → a full snapshot renders the grid: mice by sex and personality, cats by mode, traps live or occupied, food piles, mouseholes empty, adult, or brood; nutrition band on each mouse. Meter shows tick, ticks per second, requests, tokens, cost. Six charts begin filling from the summary series.
2. Frames arrive at display rate → the grid animates; charts extend.
3. User presses Pause → the server pauses the engine; frames stop; controls show Resume and Step. Step advances one tick. Resume continues. Speed sets a target tick rate the server honors when Jev latency allows.
4. User presses Stop → confirmation "Stop this run at tick N? The record so far is kept." → run status becomes cancelled; view switches to replay mode at the last tick.
5. Run reaches its tick count → "Completed" banner; controls change to Replay, Compare, Share, Export.
   → Connection drops: banner "Reconnecting" with the last tick seen; on reconnect a fresh snapshot replaces the grid and frames resume; the run never paused.
   → Jev unavailable or budget exhausted mid-run: persistent banner "Decisions are running on baseline rules since tick N" with the reason; the run continues (FR-070, FR-071).
   → Container failure: banner "Resuming from tick N" while the server restarts from the last snapshot; frames resume. If resume fails twice, the run is marked failed and the view switches to replay of what exists.

Success: a completed run with the full record. Errors: every banner above is informational; only the double resume failure ends a run early.

## F-05 Inspect an animal

For the evaluator and Carson. Entry point: clicking any animal in the live view or in replay. Requirement FR-065.

1. User clicks a mouse → inspector panel opens beside the grid: id, sex, personality with its description text, nutrition and band, age, whether it is in a hole, and its memory sentences each tagged seen or heard with age in ticks.
2. Panel's decision section shows the latest decision end to end: the exact state object sent, each question with its options or levels, the probabilities and confidence returned, the intent label with a low-confidence flag when confidence was under 0.5, the fear level, the derived signal weights, the move that resulted, and that decision's tokens and cost. In baseline mode or after a fallback, the section says which rules answered instead.
3. User clicks a cat → same panel shape: mode, target if any, last target and mode decision with its options and probabilities.
4. User keeps the panel open → it follows the selected animal as frames arrive. In replay it shows the decision current at the scrubber's tick.
   → The animal dies: panel header shows "Died at tick N, cause" and the last decision stays visible.
   → The animal enters a hole: panel notes "In a mousehole since tick N" and the decision section shows the hide decision that put it there.

Success: the evaluator can read what Jev saw and what it said for one animal at one moment. Errors: in replay, if the chunk holding the decision has not loaded yet the section shows a loading state, never stale data from another tick.

## F-06 Leave and come back

For the watcher and the researcher running long runs. Entry point: closing the tab or navigating away during a run.

1. User closes the tab → nothing happens to the run; the server keeps ticking and writing chunks.
2. User returns later and opens the library → the run shows Running with its current tick and a progress bar toward its tick count.
3. User clicks Open → live view connects, receives the current snapshot, and continues from there. Charts show the whole history from the summary series, not just from the moment of reconnect.

Success: the run is exactly where it would have been had the tab stayed open. Errors: if the run completed while away, Open lands on the completed state with Replay available.

## F-07 Run library

For signed-in users. Entry point: the header's Runs link; the landing page after sign-in.

1. Library renders a table of the user's runs, newest first: name (defaults to preset and date), status (queued, running, paused, completed, failed, cancelled), current tick over tick count, preset, Jev or baseline, cost, created, and an expiry badge on runs within 7 days of the 30-day limit. Owners see no badges.
2. Row actions: Open, Compare (adds to a two-slot compare tray), Share, Export, Rename, Delete. Delete asks "Delete this run and any share links to it?" and removes chunks, summary, snapshot, tokens, and the row.
3. Empty state: "No runs yet" with a New run button.
   → Anonymous visitors never see this screen; their single current run is reachable from the header while its cookie lives.

Success: every run the user owns is one click from replay, comparison, or sharing. Errors: a run that expired between page load and click returns "This run has expired" and disappears from the list on refresh.

## F-08 Replay a completed run

For everyone. Entry point: Open on a completed, failed, or cancelled run; the Replay control on a finished live view; a share link. Requirements FR-062, FR-065.

1. Replay view renders the grid at tick 0, the six charts complete from the summary series, and a scrubber spanning the run with chunk boundaries faintly marked.
2. User presses Play → frames are reconstructed from the loaded chunk at the chosen speed. Scrubbing to a tick outside the loaded chunk shows a brief loading state while that chunk downloads and decompresses, then renders.
3. User clicks an animal → inspector as in F-05, sourced from the chunk in view.
4. User clicks a point on a chart → scrubber jumps to that tick.
   → A chunk fails to download: "Could not load ticks N to M. Retry." Playback pauses at the boundary.
   → The run is a failed run: replay covers the ticks that were written and the scrubber ends there, with a note of the failure tick.

Success: any tick of any run the user may see, with the same inspector fidelity as live. Errors: chunk load failures are local to the range and retryable.

## F-09 Compare two runs

For the watcher and the researcher. Entry point: Compare on two library rows, or "Compare with" on a run detail. Requirement FR-063.

1. User adds two runs to the compare tray → Compare button activates → comparison view opens.
2. Left column lists every configuration field with both values; fields that differ are highlighted. Seed equality is called out explicitly, since a differing seed makes the comparison much weaker.
3. Right column overlays population over time and deaths by cause for both runs, with the remaining summary series selectable. Each series carries the run's name.
4. User clicks a tick on either chart → both runs' replay views open side by side at that tick.
   → Runs use different presets: comparison still renders, with a warning that grid size differs and the series are not like for like.
   → One run is still running: its series extend live; the diff shows its current tick.

Success: the 70 percent bold run beside the 30 percent bold run with the differing field highlighted and the curves overlaid. Errors: none beyond the warnings.

## F-10 Share a run

For signed-in owners and anyone they send the link to. Entry point: Share on a library row or run detail.

1. Owner clicks Share → dialog shows a generated link and a Copy button, with the note "Anyone with this link can watch and replay this run. It stops working if you delete the run or revoke the link."
2. Owner clicks Revoke later → link stops working immediately.
3. A viewer opens the link with no sign-in → share page renders the run's name, configuration summary, status, and the replay view (F-08) or the live view (F-04) if still running, read-only: no controls that change the run, no inspector limits, no share or export actions.
   → The run was deleted or expired, or the link revoked: a plain page "This run is no longer available" with nothing else.
   → Anonymous visitors in public mode never see a Share action.

Success: a recipient with no account watches or replays the run. Errors: one not-found page.

## F-11 Export a run

For the researcher above all, and for anyone who wants to keep a run past 30 days. Entry point: Export on a library row or run detail; Export on the configure screen for configuration only.

1. User clicks Export → menu offers "Configuration and seed (JSON)" and "Full record (archive)".
2. Configuration and seed downloads immediately as one JSON file that the configure screen can import.
3. Full record starts a download of one archive containing the configuration, the summary series, and every chunk; a progress indicator shows chunks fetched over total. For a long Large run this is hundreds of megabytes and the indicator says so before starting.
   → The download is interrupted: the user restarts it; nothing server-side changes.
   → The run is still running: Full record exports what exists so far and says which tick it ends at.

Success: a file the researcher can archive or hand to someone else. Errors: interruptions are restartable.

## F-12 Quota and budget states

For everyone, most visibly in public mode. Entry point: the header's budget indicator, and any point where a limit is reached.

1. Header always shows remaining daily Jev budget for the current subject as a bar with tokens and dollars on hover; owners see "Unlimited".
2. Budget reaches zero mid-run → the run continues on baseline rules with the banner from F-04; the header bar reads Exhausted with the reset time.
3. Budget is zero at start → Configure's Start check offers baseline mode or waiting (F-03).
4. The deployment's global budget is exhausted → every subject sees "Jev decisions are paused for everyone until the daily reset at HH:MM" and runs start or continue in baseline mode.
5. The operator has switched Jev off → the same message without a reset time.

Success: the user always knows why a run is on baseline rules and when Jev returns. Errors: none; these are states, not failures.

## F-13 Account

For signed-in users. Entry point: avatar in the header.

1. Account page shows the stored profile (Google id, email, name, avatar) with a line stating that this is everything stored about the person; today's Jev usage and budget; run count and storage used; sign out.
2. Export my data → downloads a JSON of the profile, run metadata, and usage rows, and lists run ids the user can export individually with F-11.
3. Delete account → dialog lists what will be removed: N runs, N share links, storage, usage, the account itself. User types DELETE to confirm → server revokes shares, deletes objects, rows, user, and session, in that order → landing on the sign-in page with "Your account and N runs were deleted."
   → Deletion partially fails (storage unavailable): nothing is removed, and the page says to try again; deletion is all or nothing from the user's point of view.

Success: a clean account and a clean exit. Errors: the all-or-nothing rule above.

## F-14 Queue

For everyone when the deployment is busy. Entry point: Start when 20 containers are active.

1. Start returns queued → live view shows a queue card: "Waiting for a slot. Position N." with Cancel.
2. A slot frees → the run starts automatically; the card is replaced by "Starting" then the first frames.
3. User clicks Cancel while queued → run row removed; back to Configure with the same values.
   → The user leaves while queued: the run still starts when its turn comes and appears as Running in the library.

Success: a fair wait with a visible position. Errors: none.

## F-15 Baseline twin

For the evaluator and Carson: the showcase's central comparison. Entry point: "Run baseline twin" on a completed Jev run's detail.

1. User clicks Run baseline twin → Configure opens prefilled with the run's exact configuration and seed, Jev switched off, locked, with the note "Same world, code-only decisions."
2. User clicks Start → the twin runs (fast, since no Jev calls) → on completion the run detail offers "Compare with original".
3. Compare opens F-09 with Jev on or off as the only highlighted difference.

Success: two curves on one chart that differ only because one colony had judgment. Errors: as in F-03 and F-09.

## F-16 Public-mode run lifetime

For anonymous visitors. Entry point: any anonymous run.

1. Visitor starts a run in public mode → header shows "Kept until HH:MM tomorrow" on the run.
2. Visitor returns within 24 hours with the same cookie → the run is reachable from the header and replays normally.
3. After 24 hours → the run is gone; opening its URL shows "This run is no longer available." The visitor can start a new one.

Success: a complete, short-lived experience with no account. Errors: none beyond expiry.

## Resolved on approval

The compare tray resets on reload. Share viewers can open the inspector. Rename is in the first version. The configure screen shows an expected duration at current Jev latency, labeled as an estimate.
