---
title: jev-mice User Guide
version: 1.1
status: final
author: Carson Sweet
assisted_by: Claude Code + SweetClaude
date: 2026-09-20
audience: hybrid
nda: false
changes: minor. Unwrapped: one paragraph is one line. No content changed.
previous_file: none
---

# jev-mice User Guide

**Version:** 1.1

**Date:** 2026-09-20

**Where it runs:** https://mice.jev.carsonsweet.com

---

## 1. What this is

jev-mice is a small ecology on a grid. Mice forage, hide, breed and die. Cats hunt them. Traps sit waiting. Food grows back on a timer. You set the starting conditions and watch what happens.

The point is not the mice. Every animal's next move is a judgment call, and you choose who makes it: TypeSafe's Jev model, or a fixed set of rules written to do the same job without judgment. Run the same starting conditions both ways and the difference between them is the thing worth looking at.

Nothing here is a game. There is no score and nothing to win. A run either sustains a population or it does not.

---

## 2. Starting a run

Open the site. The left column is the configuration; the middle is the world; the right is the inspector.

### Decided by

**Use Jev** asks the model for each animal's intent. **Use rules** computes the same decisions from a fixed table.

Two things to know before you choose. Jev is much slower: a run manages around six turns a second against the rules' three hundred, because every decision is a network call. And Jev is not deterministic, so the same seed run twice with Jev will not produce the same world, while the rules will, exactly.

If the button is disabled, no decision key is configured and only the rules are available.

### World

Three sizes. Everything else scales from the grid area.

| Preset | Grid | Most mice | Most cats | Most food | Most holes | Most traps |
|---|---|---|---|---|---|---|
| Small | 48 x 32 | 61 | 3 | 30 | 30 | 15 |
| Medium | 80 x 50 | 160 | 10 | 80 | 80 | 40 |
| Large | 120 x 75 | 360 | 22 | 180 | 180 | 90 |

The caps are hard. A configuration above one of them is refused with the cap shown.

### The starting conditions

Each preset opens on settings that were measured rather than chosen, so a default colony usually survives its run but visibly might not.

| Preset | Male | Female | Cats | Traps | Food piles | Mouseholes |
|---|---|---|---|---|---|---|
| Small | 15 | 15 | 1 | 4 | 20 | 16 |
| Medium | 30 | 30 | 3 | 8 | 60 | 24 |
| Large | 30 | 30 | 4 | 8 | 80 | 32 |

All three use a food respawn of 60 turns, a nutrition decay of 0.3 a turn, and an even personality mix.

**Turns** is how long the run lasts, from 100 to 20,000. Note what this costs with Jev: at about six turns a second, a 20,000-turn Jev run takes roughly fifty-four minutes whatever the speed slider says.

**Food respawn** is how many turns an eaten pile takes to come back somewhere else. Zero means never.

**Nutrition decay** is how fast a mouse burns through what it has eaten, inside a hole or out. At zero nutrition a mouse starves.

### Personality mix

Four traits, as percentages that must total 100. Every mouse spawned or born draws one.

- **Bold** approaches food despite nearby danger, explores far from shelter, and
is slow to flee.
- **Cautious** flees early, avoids places it remembers as dangerous, and prefers
to forage near where it has eaten before.
- **Vigilant** notices danger sooner than other mice and readily warns the ones
it meets. It sees eight cells where others see six.
- **Social** seeks out other mice, shares what it has seen readily, and looks
for a mate as soon as it is able. It warns mice two cells away rather than one.

### Use existing seed

Leave it blank and a seed is chosen for you. Paste one from an earlier run to repeat that run exactly, mouse for mouse. This only holds for runs decided by the rules.

### The survival estimate

Above the start button, a line reads something like **"Survived 13 of 16 measured runs."**

This is not a guess. The reference curve was built using deterministic methods, so the chance a configuration survives is exactly the fraction of seeds that survive it, and that was measured offline: 864 configurations, 16 seeds each, 13,824 runs in all.

It is shown as a count rather than a percentage on purpose. Sixteen seeds put a reading of "half" inside roughly plus or minus twenty-five points, and "50%" hides that where "8 of 16" does not.

Four things it will tell you rather than guess:

- **It changes when you change the number of turns.** Survival is not a property
of the settings alone. Every configuration measured survives 800 turns; they only separate after 1,800.
- **It refuses above 4,000 turns**, which is as far as the sweep ran.
- **It refuses for a cat count it never measured.** The boundary in that
dimension is sharp enough that interpolating across it would report a number no run produced.
- **It names the nearest measured combination** when your settings sit between
measured points, and names any knob the sweep held fixed that you have moved.

One honest limit: the sweep held the personality mix, the decay rate and the starting nutrition fixed. Move those and the panel keeps its number but adds a line saying it is now a rough guide. And the figure was measured with the rules deciding, so for a Jev run it describes what that world does on its own rather than what your run will do.

---

## 3. Watching a run

### The map

Ten marks, each a shape rather than only a colour, so they stay legible at every grid size.

| Mark | Meaning |
|---|---|
| Blue circle | Mouse |
| Blue circle, yellow dot | Hungry mouse |
| Green square | Food pile |
| Red triangle | Cat |
| Red triangle, yellow dot | Hungry cat |
| Orange diamond | Trap |
| Dark diamond, blue dot | Trap holding a dead mouse |
| Grey ring | Mousehole, free |
| Grey ring, small blue dot | Mousehole, an adult sheltering |
| Grey ring, filled blue | Mousehole, a litter inside |

Colour says what a thing is and never how it is doing. Hunger is one bright dot, the same dot on a mouse and on a cat.

### Transport

Left to right: all the way back, one turn back, play and pause, one turn forward, all the way forward. The scrubber jumps anywhere in what has been buffered. The buttons show state; there is no status text.

### Speed

One turn a second at the left, 334 at the right. Every run starts slow.

With Jev deciding, the slider does very little: Jev is the bottleneck, not the pacer, and the run will sit around six turns a second wherever you put it. The picture still updates smoothly, because the frame rate follows the speed the run achieves rather than the speed you asked for.

### As it happens

The log below the map carries every change to the population, with the decision that preceded it and who made it, so a choice and its consequence sit on one line. It follows the newest line unless you scroll up, and then it stays where you put it until you press "Follow the newest".

### Over time

The chart tracks population, cats, food and traps against the turn count, using the same marks as the map.

### Inspector

Click any mouse or cat to follow it: what it intends, how frightened it is, what it has eaten, what it remembers. Hovering a line in the log highlights whatever it mentions that is still on the map.

### Total extinction

When nothing living is left, the run stops.

---

## 4. After a run

**See all previous runs** opens a table of every run held: when it started, its seed, its settings, the highest and lowest mouse and cat counts, and what was left at the end.

Clicking one opens its turn-by-turn record. Every turn lists its population and the change from the turn before, and opening a turn shows every life-changing event in it — eating, dying, breeding, hunger crossing a band, a mouse spotting a trap, a cat giving up on a target. Plain movement is left out.

From the run menu you can also take a **report**, which is the run's measures against their thresholds, and a **data dump** of the whole record as gzipped JSON lines.

---

## 5. Observed Behaviors

What follows is what the simulation actually does. Where a number is given, it was measured; where it is a rule, it is a rule.

### Individual mice

**A mouse does one thing at a time.** Its intent is one of six: eat, flee, hide, seek a mate, nest, or explore. It holds an intent for twelve turns before reconsidering, or six when panicked, which is why a mouse often keeps walking towards food with a cat in view.

**Fear has four levels** — unconcerned, wary, alarmed, panicked — and they change what it will consider, not just how fast it moves.

**Hunger slows it down.** A fed mouse moves every turn, a hungry one every two, a starving one every three. So a starving mouse is three times easier to catch, and starvation and predation compound rather than competing.

**A hungry mouse will not hide.** Below the fed band the drive is not offered at all, because a mouse that hides while starving dies waiting. You will see mice leave shelter with a cat visible, and that is deliberate.

**Memory expires after 300 turns.** A mouse avoids where it remembers danger and returns to where it remembers food, and then it forgets.

**Mice warn each other.** A mouse passing within one cell of another passes on what it has seen; a social mouse reaches two cells. Watch the log during a cat's approach and you can see an alarm travel through a cluster faster than the cat does.

**Trap survival depends on condition.** A mouse that walks into a trap escapes on a coin flip scaled by its nutrition: a full mouse escapes half the time, a mouse at 30 percent escapes 15 percent of the time. The log gives the exact odds it rolled against.

### Breeding

**Breeding needs a free shelter.** With an available mouse hole to shelter in, mice will not procreate.

**The sequence is slow.** Mating takes 5 turns, gestation 60, birth 5. A litter is two to four pups.

**Pups leave when hunger takes them out.** They are born at 75 nutrition and stay in the hole until they drop below the fed band at 60, which at the default decay is about 50 turns. Change the decay and that wait changes with it.

**A full world loses litters.** At the population cap, births are lost and the log says so: "the world is full."

### Cats

**A cat has five modes** — prowl, stalk, pounce, rest, eating — and the log names the switch each time.

**Hunger makes a cat more dangerous, not less.** Below half nutrition its sight goes from 8 cells to 11, its pounce range from 3 to 4, and its pounce cooldown halves from 20 turns to 10. A starving cat is the most effective hunter on the map.

**A cat is worth less than a full meal.** One mouse restores 50 of 100, so a cat must keep hunting rather than eating once and resting.

**Cats starve too, but not at the shipped defaults.** Their nutrition decays at a tenth of a mouse's, so a cat outlasts any individual mouse but not a long drought. Measured over 4,000 turns on the medium defaults, the cat count never moved off 3 — there are always enough mice. Starve the map instead (20 food piles, respawn 200) and the cats go from 3 to 0 as the mice collapse, with the log reading "starved, with nothing left to catch." If you want to see a predator die, you have to take the food away.

**Cats give up.** A cat abandons a target after 30 turns of not closing on it.

**Eating costs it 10 turns** during which it catches nothing, which is often when the surviving mice get clear.

### The colony

These are the patterns that emerge, and the ones that surprised us.

**Shelter is the strongest single lever — stronger than food.** On the small map, everything else held equal, 12 mouseholes leaves half of all seeds extinct where 24 leaves none. If a colony is dying and you only change one thing, change the mouseholes.

**A predation-limited colony is stable; a starvation-limited one decays.** Fast food respawn with more cats holds a population at its level across a long run. Slow respawn with fewer cats looks healthier early and then thins out. The shipped defaults are built the first way, which is why they have more cats than you might expect.

**Extinction is late.** Every configuration measured survives 800 turns. They only begin to separate after 1,800. A run that looks fine at turn 500 tells you almost nothing.

**The cat axis has a cliff, not a slope.** At one set of medium food settings, two cats left the colony alive on all 16 seeds and three killed it on all 12. One cat is the difference between a stable world and a dead one, which is why the survival panel refuses to interpolate across it.

**There is no predator-prey cycle at the defaults.** This is the one we expected to find and did not. The textbook pattern needs the predators to crash when the prey thin out, and the shipped settings never let that happen: over 4,000 turns the cats sat at 3 throughout while the mice swung between 45 and the cap of 160. The cats are a constant pressure the mice live under, not the other half of an oscillation. Cut the food supply and you get the crash, but then the colony usually goes with it.

**Mice cluster, measurably.** Food and shelter are fixed points, so the population gathers rather than spreading out. Measured on the medium defaults, the mean distance from a mouse to its nearest neighbour is about 1.5 cells, against 2.5 for the same number of mice scattered at random — so they sit roughly 40 percent closer together than chance. A cat that finds a cluster does a great deal of damage quickly.

**The population runs up against its cap.** On the medium defaults it reaches 160, the ceiling for that grid, and litters start being lost. If the log fills with "the world is full," the colony is not struggling — it has won.

### Jev against the rules

**Both keep the population alive under the shipped defaults.** The difference is in how, not whether.

**The rules have a documented blind spot.** A fed mouse with a cat three cells away and no shelter within four gets only a floor value for flee, below the threshold the flee-or-hide measure wants. The rules score about 36 percent on that measure against a threshold of 80, and the requirements now state they are not expected to meet it. It is the comparison Jev's figure is read against, not a bar the rules were meant to clear.

**Jev is asked only genuine judgment calls.** Anything with a right answer is computed. Jev never sees a number, a distance or a coordinate — only bucketed words — and it chooses among options the code has already narrowed. Up to eight nearby mice are decided in one request.

---

## 6. Limits and known behaviour

**A Jev run cannot be replayed exactly.** The model is self-consistent but not guaranteed identical, so the same seed gives a different world. Rules runs are byte-identical on the same seed.

**The spend ceiling can switch you to the rules mid-session.** The deployment spends at most a set amount on Jev a day across every visitor. Past it, new runs use the fixed rules and say so rather than the site refusing anyone.

**Runs are not private.** There are no accounts. Anyone with the link sees every run in the list.

**The oldest finished run is dropped** once the deployment is holding 200. A run still going is never dropped.

**Long Jev runs are long.** At about six turns a second, 20,000 turns is roughly fifty-four minutes. The run continues on the server if you close the page.
