# Assumption Register

| # | Date | Assumption | Risk if wrong | Validation plan |
|---|---|---|---|---|
| 1 | 2026-09-19 | Choice probabilities used as blended signal-field weights read as animal behavior, not jitter | The demo undercuts Jev. Scenario scn-3: the colony looks like Brownian motion | First 60-mouse run. Per-decision log isolates Jev output, bucketing, blend, and cadence. Compare argmax-only movement against blended movement side by side |
| 2 | 2026-09-19 | Event-driven cadence of roughly one decision per agent per 8 ticks keeps a 2,000-tick run watchable within 1,200 requests per minute | Runs crawl. Iteration and viewing both suffer | Measure ticks per second and requests per minute at 60 mice. Batch nearby agents into one request |
| 3 | 2026-09-19 | Seeded RNG plus logged Jev responses make a run replayable and two runs comparable | Changing one starting condition proves nothing. Scenario scn-1 is unanswerable | Replay a run from its telemetry and diff the outcome. Hold the seed fixed while varying one knob |
| 4 | 2026-09-19 | Cost stays near $0.20 per 1,000 ticks at 60 mice and 600 tokens per decision | Cost surprises on long runs | Live token and cost meter. Per-run cost recorded in telemetry |
| 5 | 2026-09-19 | Bucketed-word state carries enough signal for Jev to make good drive tradeoffs without any numbers | Poor judgments that look arbitrary in the visible-judgment panel | Spot-check decisions against expected behavior in the panel. Tune bucket boundaries and criteria wording, not the model |
