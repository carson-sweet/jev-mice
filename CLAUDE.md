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

## SweetClaude

- Read `.sweetclaude/state/phase.yaml` and `.sweetclaude/state/improvement-register.md` at session start if they exist. If `.sweetclaude/state/phase.yaml` exists and `.sweetclaude/disabled` does not exist, invoke `sweetclaude:status` automatically at session start.
- Follow the interaction model in `/Users/carsonsweet/.claude/plugins/cache/sweetclaude-stable/sweetclaude/4.5.2/rules/interaction-model.md`.
- Respect the current deference level. Ask if not set.
- Never push for phase advancement. The user decides when to move on.
