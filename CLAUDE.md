# jev-mice

A browser simulation of mice, cats, traps, and food where TypeSafe's Jev arbitrates each animal's drives, with full telemetry for comparing outcomes across starting conditions.

## Key directories

- `src/` — source code
- `tests/` — test suite

## Commands

```bash
# Install
# TODO: add install command

# Test
# TODO: add test command

# Build
# TODO: add build command
```

## Project-specific rules

- The TypeSafe API key never reaches the browser. Jev calls go through a server-side proxy.
- Jev receives bucketed words, never raw numbers, distances, or coordinates. Code does all arithmetic.
- Code owns anything with a clear right answer. Jev is asked only for genuine judgment calls, over options code has already narrowed. Reference implementation: ~/dev/jev-plays-brogue.

## Scope changes

When Carson changes what the product does, three things move in the same commit
as the code: the requirements document (a new version, the old one deprecated),
`.sweetclaude/state/scope-changes.md`, and the decision log. Writing only the
decision log is the failure that left the requirements saying cats do not die
for two hours and fifteen commits.

An exclusion in the requirements' Out of Scope list must have an entry in
`DISPROVED_BY` in `packages/engine/test/ep3/scope.spec.ts`, naming the event
that would prove the engine has it after all, or null where nothing can. That
test reads the list back and fails when the build has overtaken it.

## SweetClaude

- Read `.sweetclaude/state/phase.yaml` and `.sweetclaude/state/improvement-register.md` at session start if they exist. If `.sweetclaude/state/phase.yaml` exists and `.sweetclaude/disabled` does not exist, invoke `sweetclaude:status` automatically at session start.
- Follow the interaction model in `/Users/carsonsweet/.claude/plugins/cache/sweetclaude-stable/sweetclaude/4.5.2/rules/interaction-model.md`.
- Respect the current deference level. Ask if not set.
- Never push for phase advancement. The user decides when to move on.
