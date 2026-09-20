# jev-mice

A tick-based ecology of mice, cats, traps, food and mouseholes where each
animal's next move is a judgment rather than a rule. TypeSafe's Jev arbitrates
the drives; the code narrows the legal options first and applies whatever comes
back.

Version 0.1.0 · 2026-09-20

## Running it

```bash
npm install
cp .env.example .env   # optional; put your key in it
npm run build          # builds the viewer
npm start              # serves it on http://localhost:8787
```

With no key the page offers only the fixed rules and says why. With one, each
run is started on Jev or on the rules from a switch on the configuration panel,
so the same seed can be run both ways and compared. The key is read by the host
process and never reaches a browser.

`.env` is gitignored. Every setting it holds is listed in `.env.example`.

For viewer work, `npm run dev` serves the page with hot reload and proxies the
API to a host already running on 8787.

## What is here

| Path | What it is |
|---|---|
| `packages/engine` | The simulation. Pure, seeded, no clock and no network. |
| `packages/provider-jev` | Turns a batch of decisions into one request and back. |
| `apps/sim` | The process that runs the loop and writes chunks. |
| `apps/host` | The local server: runs, sockets, stored objects. |
| `apps/web` | The viewer. |

The engine never reaches for the clock, the network or the document, so a run
with a given seed and a given provider produces the same event stream every
time. The determinism suite is what holds that true:

```bash
npm test                  # everything
npm run test:determinism  # the seed, replay and snapshot round trip
npm run typecheck
```

## How a decision is made

Code narrows first. A mouse is only offered drives its situation allows: `eat`
only when it perceives food, `hide` only when a mousehole is free, `nest` only
when it is carrying a litter past term. `explore` is always offered, so the
option set is never empty.

What Jev receives is words. A mouse's state has no coordinates, no tick numbers
and no population counts, because numeric comparison over large states is where
a System One model is weakest. Distances become "very close" or "nearby",
nutrition becomes "hungry", and memories are sentences.

Up to eight mice that are near one another share one request, which is what
keeps the request rate inside the published limit. Grouping is by spatial sort
rather than by map tile; confining a batch to a tile measured at 6.76 requests
per tick against 1.74 for the sort.

The probabilities come back as movement weights rather than as a single choice.
A mouse that is 60 percent inclined to eat and 40 percent to flee moves on a
field weighted 60/40, so the judgment shapes the path instead of switching it.

Fear scales the distance danger is felt over, not the size of the danger. The
signal fields are normalized across the nine cells a mouse can step to, so a
multiplier would be cancelled exactly and do nothing.

When the service is slow, over budget or unreachable, that batch is answered by
the fixed rules and the run continues. The record says which decisions were
judged and which were computed, so the two are never confused.

## Watching a run

The speed slider paces the run in ticks a second, from one at the left to about
three hundred and thirty at the right, which is a full-length run in a minute or
as fast as the machine manages. The server does the pacing, so the slider
changes the simulation's rate rather than dropping frames on the way to the
page. How often frames are sent follows the pace, so one tick a second is
watchable and full speed does not flood the socket.

A run starts slow, at a tick a second, because the first thing anyone sees
should be watchable. Drag the slider right when you want it to get on with it.

Under the chart, the running log shows every change to the population as it
happens, and for a death it names the decision the animal was last given and
who gave it. A colony collapsing and then its cats leaving one by one reads as
a sequence of lines rather than as a chart going flat.

Pointing at anything on the map names it and says how it is doing. Hovering a
line in the log rings whatever that line is about, where it is still standing.

The transport controls are a video player: jump to the start, step back, play or
pause, step forward, jump to the end, and a scrubber. Forward is the simulation
advancing. Backward moves a playhead through the frames this page has already
received, because the engine runs forwards only and reconstructing an earlier
turn live would mean replaying from a snapshot. The scrubber therefore covers
what this page has seen, not the whole run; for the whole run, open it from the
library.

`/#/runs` lists every run so far, newest first, with its seed, its settings, and
the highest, lowest and final count of mice and cats. Opening a run reads it
turn by turn: what was standing at the end of each turn, how that changed, and
under each turn every event of it except plain movement. That is assembled on
request from what the run already stored, so nothing extra is written while a
run is going.

## Reading the map

Shape carries what a thing is, and colour never changes with its condition. A
mouse is a blue circle, a cat a red triangle, food a green square, a trap an
orange diamond and a mousehole a grey ring. A hungry animal keeps its own colour
and gains one bright yellow dot, the same dot on a mouse and on a cat.

The four solid shapes stay distinct down to a few pixels, which is why the same
glyphs work on the large preset as on the small one. The key under the map and
the chart's own legend both draw their swatches with the same function the map
uses, and a test asserts the key names every glyph exactly once, so none of the
three can drift apart.

A mousehole shows what is in it: hollow when free, a small blue dot for an
adult sheltering, filled blue for a litter.

Two marks are not in the key because they are not things in the world: a yellow
ring around the mouse you have selected, and the same ring around whatever a
hovered log line is about. A mouse inside a mousehole is not drawn; the hole
shows it instead.

A cat has its own hunger. It decays slowly, a mouse restores half of it, and a
cat below half sees further, springs from further away and stops resting after
losing a mouse. A cat that catches nothing starves to death, on the same terms
as a mouse, which is the only way predation pressure is ever removed from a run.

When no mouse and no cat is left alive the run stops there rather than counting
out its remaining turns over an empty map, and the viewer says so in large type
over the world it ended in.

## What the numbers say

The colony is bistable under the fixed rules, and the threshold is sharp.
Holding food at 50 piles on a 15-tick respawn and decay at 0.3, three cats
leave a colony alive on all eight seeds tried and four collapse it. This is the
behaviour the telemetry exists to study, not a defect, but it does mean a
single run is not evidence of anything.

**The defaults are one of the settings that collapse.** As the requirements
specify them, the medium default drives the population to zero well before tick
1000 on every seed tried. Turn the food up, the decay down, or a cat off, and
the colony establishes. This is recorded as an open decision rather than
quietly corrected, because the numbers are ones the requirements state.

## Not built yet

The hosted multi-tenant deployment: Cloudflare Workers, Durable Objects,
Containers, R2, Neon and Google sign-in. The designs are complete and the
simulation process already speaks the coordinator protocol that the Run object
will answer, which is why the local host can stand in for it unchanged. What
remains is the platform, and it needs accounts and credentials.
