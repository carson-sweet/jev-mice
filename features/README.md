# Feature specifications

Gherkin for the hosted service, epics 5 to 10. Generated from the user stories;
edit the story and regenerate rather than editing these by hand.

The engine's epics, 1 to 4, are not here. Their scenarios are executable tests in
`packages/engine/test/`, because the engine is pure TypeScript with no dependencies
and its tests can fail today for the right reason. A scenario about signing in with
Google cannot run until a Worker, a database and an identity provider exist, so
writing its steps now would produce a suite that is red because nothing is built
rather than because behaviour is wrong.

Step definitions are pending. Each becomes runnable as its stage of the
implementation sequence lands, in this order:

| Stage | Brings | Makes runnable |
|---|---|---|
| 6 Worker foundation | sessions, sign-in | ep08 |
| 7 Coordination | run lifecycle, the container protocol | ep05 |
| 8 Viewer | the socket, frames, the canvas | ep07 |
| 10 Library and replay | chunk paging, comparison | ep06, ep09 |
| 11 Sharing and retention | share links, the sweep | ep09 |
| 12 Public mode and hardening | quotas, deletion, observability | ep10 |

86 scenarios across 6 files.
