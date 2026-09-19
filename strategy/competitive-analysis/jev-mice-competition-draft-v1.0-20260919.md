---
title: jev-mice Competitive Survey
version: 1.0
status: draft
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-19
audience: internal
nda: false
changes: initial draft
previous_file: none
---

# jev-mice Competitive Survey

**Version:** 1.0

**Date:** 2026-09-19

**Depth:** L1 survey. Who the neighbors are, what they claim, how they are received, and what each implies for jev-mice. No matrix, no feature-deep analysis.

**Work item:** WI-001, Discover phase.

## Why these neighbors

jev-mice sits between two families that do not normally meet. Agent-based ecology and evolution sims define what a watcher expects from a population simulation: parameter sliders, a live population plot, and a way to inspect one creature. LLM-driven agent simulations define what a TypeSafe evaluator will compare System One judgment against. Neither family has a product that uses a calibrated decision model as the agent's mind, which is the gap jev-mice occupies.

## Group 1: agent-based ecology and evolution sims

### NetLogo Wolf Sheep Predation

**Who:** Uri Wilensky, Center for Connected Learning, Northwestern. Part of the NetLogo Models Library.

**Stated positioning:** The canonical teaching model for predator-prey stability. A system is unstable if it tends toward extinction and stable if it maintains itself despite fluctuation.

**Claimed differentiators:** Sliders for initial populations and reproduction probabilities, a live populations plot, inspect-any-agent, and a docked variant that runs the agent-based model beside a System Dynamics aggregate model of the same system for direct comparison.

**Reception:** The default first model in agent-based modeling courses. Hundreds of derivative models on the Modeling Commons.

**Implication for jev-mice:** Sliders plus population plot plus inspect is the baseline UI vocabulary. The docked-hybrid idea transfers directly: a code-only baseline mode that runs the same seed with hand-coded utility rules instead of Jev, side by side, would let an evaluator see what Jev adds. Candidate scope addition for the brief.

### The Bibites

**Who:** Leo Caussan, passion project since 2017. Steam and itch.io, Windows, macOS, Linux.

**Stated positioning:** "Digital Life." An artificial life simulation whose goal is to show life does not have to be carbon based.

**Claimed differentiators:** Each creature has a neural-network brain and genome you can open and read. A Lineage Tree shows species appearing and going extinct. A Lineage Mesh shows relative populations over time. Pheromones let creatures communicate.

**Reception:** Very Positive on Steam, 96 percent of 218 reviews. Large YouTube following.

**Implication for jev-mice:** The per-creature inspect panel is the bar. Ours shows the state Jev received, the drive distribution, the fear score, and the memory list instead of a neural net. Bibites' lineage views suggest a personality-survival view: which personality lines persist across generations under a given cat and trap load. Candidate scope addition.

### The Life Engine

**Who:** Max Robinson, Emergent Garden. Browser, open source, many forks.

**Stated positioning:** A cellular automaton for long-run natural selection with no fitness function. Organisms survive by out-competing neighbors.

**Claimed differentiators:** Zero install, instant start, organisms as cell structures that evolve mouths, eyes, movers, and a brain.

**Reception:** Popular through YouTube. Forked widely on GitHub.

**Implication for jev-mice:** Browser-first with instant start is the expectation. The configure-then-run flow must feel that light, which argues for sensible defaults and a one-click start over a long setup form.

### Primer

**Who:** Justin Helps, YouTube channel. Interactive version built with MinuteLabs.

**Stated positioning:** Explainer videos that simulate natural selection with blobs whose traits are words: size, speed, sense.

**Claimed differentiators:** One variable changed at a time with a clear before and after. Millions of views. Inspired many open-source clones.

**Reception:** The reference for making a simulation legible to a general audience.

**Implication for jev-mice:** Scenario scn-1, change one starting condition and compare, is exactly Primer's narrative device. The telemetry comparison view should support two runs that differ in one knob, shown side by side. Traits-as-words is also our personality model.

### biosim4

**Who:** David Randall Miller. Console program plus the video "I programmed some creatures. They evolved." Browser ports exist.

**Stated positioning:** Genome-to-neural-net creatures in a 2D arena with configurable survival criteria.

**Claimed differentiators:** Readable genomes, everything driven from a config file, movie output of runs.

**Reception:** Viral video, active forks.

**Implication for jev-mice:** Config-file-driven, reproducible runs are what the academic researcher segment expects. Export and import of a run's configuration and seed as one JSON file. Candidate scope addition.

## Group 2: LLM-driven agent simulations

### Generative Agents (Smallville)

**Who:** Park, O'Brien, Cai, Morris, Liang, Bernstein. Stanford and Google, 2023. Open source.

**Stated positioning:** Believable simulacra of human behavior. An LLM extended with a memory stream, reflection, and planning.

**Claimed differentiators:** Twenty-five agents in a Sims-style town. Natural-language memories retrieved by recency, importance, and relevance. Emergent social behavior such as a party being planned and attended.

**Reception:** Landmark paper, widely cited and cloned. Commonly noted as slow and expensive to run because every agent step is a reasoning call.

**Implication for jev-mice:** This is the direct contrast and the showcase's framing. Their agents reason in prose through a System Two loop. Ours judge in calibrated probabilities in about 100 ms at $0.042 per million input tokens. Our memory-as-sentences design deliberately echoes their memory stream at a fraction of the cost. The brief should name this contrast.

### AI Town

**Who:** a16z-infra, on Convex. MIT licensed.

**Stated positioning:** A deployable open-source Smallville in TypeScript. "The Sims with a brain."

**Claimed differentiators:** One-click deploy to Convex, Fly.io, or Docker. Runs locally with local models. Brings generative agents to the JavaScript ecosystem.

**Reception:** Popular starter kit for LLM agent experiments.

**Implication for jev-mice:** Same stack shape: TypeScript, browser client, server holding the model key. Evaluators will have seen this architecture. Our differentiator is the decision primitive, not the stack, so the visible-judgment panel carries the argument.

### Project Sid

**Who:** Altera, 2024. Paper and code.

**Stated positioning:** Many-agent simulations toward AI civilization. Ten to over a thousand agents in Minecraft via the PIANO architecture.

**Claimed differentiators:** Agents specialize into roles, follow and change collective rules, and transmit culture.

**Reception:** Notable for scale claims and for the infrastructure required to reach them.

**Implication for jev-mice:** Scale is where LLM agents strain. Our pitch is dozens of agents deciding inside a 1,200 request per minute limit for pennies per thousand ticks. Telemetry should show decision rate and running cost prominently, since that is the number an evaluator will compare.

## What the survey implies

**UI vocabulary the watcher expects:** parameter sliders and a live population plot (NetLogo), an inspect-one-creature panel (Bibites), one-variable side-by-side comparison (Primer), config files that reproduce a run (biosim4).

**Showcase framing:** System One agents against System Two agents. Same memory-stream idea as Generative Agents, delivered as calibrated probabilities instead of prose, at roughly two orders of magnitude lower latency and cost. AI Town shows the stack is not the story.

**Candidate scope additions for the brief to accept or reject:**

- Code-only baseline mode on the same seed, for A/B against Jev (from NetLogo's docked hybrid).
- Personality-survival view across generations (from Bibites' lineage views).
- Run configuration and seed export/import as JSON (from biosim4).

## Sources

- [NetLogo Wolf Sheep Predation, Modeling Commons](https://modelingcommons.org/browse/one_model/1390)
- [NetLogo Wolf Sheep Predation (docked hybrid)](https://ccl.northwestern.edu/netlogo/models/WolfSheepPredation(DockedHybrid))
- [The Bibites: Digital Life on Steam](https://store.steampowered.com/app/2736860/The_Bibites_Digital_Life/)
- [The Bibites site](https://www.thebibites.com/)
- [The Life Engine on GitHub](https://github.com/MaxRobinsonTheGreat/LifeEngine)
- [Primer natural selection simulation, FlowingData](https://flowingdata.com/2019/07/31/natural-selection-simulation/)
- [biosim4 on GitHub](https://github.com/davidrmiller/biosim4)
- [Generative Agents: Interactive Simulacra of Human Behavior, ACM](https://dl.acm.org/doi/10.1145/3586183.3606763)
- [Generative Agents on GitHub](https://github.com/joonspk-research/generative_agents)
- [AI Town README](https://github.com/a16z-infra/ai-town/blob/main/README.md)
- [Project Sid, arXiv](https://arxiv.org/abs/2411.00114)
- [Project Sid on GitHub](https://github.com/altera-al/project-sid)
