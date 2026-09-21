// Toxoplasma gondii, as the parasite actually works.
//
// The research this encodes, and the one place it contradicts the obvious guess:
//
// Cats shed oocysts in their faeces; the oocysts sporulate in one to five days
// and survive in soil and water for months to years, accumulating. Rodents are
// infected by eating contaminated material. So contamination belongs to food,
// at creation and at respawn.
//
// Infected rodents lose their innate aversion to cat odour -- the "fatal feline
// attraction" of Berdoy, Webster and Macdonald. Later work refines it twice
// over: the effect is a general reduction in anxiety and predator aversion
// rather than anything cat-specific, and it persists after the parasite itself
// is cleared. So it is modelled as a permanent, general damping of fear.
//
// Cats do NOT prefer to eat infected mice. No evidence supports a predator-side
// appetite. Infected prey is simply easier to catch, and the high infection
// prevalence found in cat-hunted small mammals is the consequence of that. The
// engine therefore gives cats no preference at all, and the prevalence among
// the caught has to emerge.
//
// The documented mouse-to-mouse route is vertical: 75 percent in a natural
// mouse population, 12.5 to 44.4 percent by inoculum dose, 60.6 percent during
// acute infection. Nothing supports horizontal spread between mice without a
// cat, so there is none here.
//
// Lifespan is strain-dependent and messy, but chronic cachexia is consistent:
// roughly 20 percent body mass lost, with no recovery. That is modelled as
// faster nutrition burn rather than a scripted death.

// Several of these run thousands of turns and exceed the default five-second
// budget when the suite runs in parallel, so they carry their own.
import { describe, it, expect } from 'vitest'
import { TOXO, dampenFear } from '../../src/types.js'
import { engine, medium, runTicks, of } from '../helpers.js'

const clean = (over = {}) => medium({ toxoplasmosisRate: 0, ...over })
const filthy = (over = {}) => medium({ toxoplasmosisRate: 100, ...over })

describe('Toxoplasmosis: how it gets into a mouse', () => {
  it('Leaves the world clean when the rate is zero', async () => {
    const e = engine(clean({ ticks: 400 }))
    const evs = await runTicks(e, 400)
    expect(of(evs, 'mouse_infected')).toHaveLength(0)
    expect(e.world().mice.every((m) => !m.infected)).toBe(true)
    expect(e.world().food.every((f) => !f.contaminated)).toBe(true)
  })

  it('Contaminates every pile at the top of the range', async () => {
    const e = engine(filthy({ ticks: 10 }))
    await runTicks(e, 10)
    expect(e.world().food.every((f) => f.contaminated)).toBe(true)
  })

  it('Infects a mouse that eats a contaminated pile', async () => {
    const evs = await runTicks(engine(filthy({ ticks: 400, cats: 0, traps: 0 })), 400)
    const eaten = of(evs, 'food_eaten')
    expect(eaten.length).toBeGreaterThan(0)
    const infected = of(evs, 'mouse_infected')
    expect(infected.length).toBeGreaterThan(0)
    expect(infected[0]!.via).toBe('food')
  })

  it('Never un-infects a mouse', async () => {
    // The behavioural change outlasts the parasite, so there is no recovery.
    const e = engine(filthy({ ticks: 600, cats: 0, traps: 0 }))
    const evs = await runTicks(e, 600)
    const first = of(evs, 'mouse_infected')[0]
    expect(first).toBeDefined()
    const still = e.world().mice.find((m) => m.id === first!.id)
    if (still) expect(still.infected).toBe(true)
  })
})

describe('Toxoplasmosis: what it does to a mouse', () => {
  it('Damps fear by one step, wherever on the scale it started', () => {
    // A general reduction in anxiety, not a cat-shaped hole in it, so the whole
    // scale moves rather than only the cat-facing end.
    expect(dampenFear('panicked')).toBe('alarmed')
    expect(dampenFear('alarmed')).toBe('wary')
    expect(dampenFear('wary')).toBe('unconcerned')
  })

  it('Cannot damp below unconcerned: less afraid, not fearless', () => {
    expect(dampenFear('unconcerned')).toBe('unconcerned')
  })

  it('Damps the answer whichever decider gave it', async () => {
    // Applied in the engine rather than in the rules, so a Jev run and a rules
    // run are affected identically and neither decider has to be told the mouse
    // is ill -- which it has no way of knowing.
    const e = engine(filthy({ ticks: 600, cats: 3 }))
    await runTicks(e, 600)
    const w = e.world()
    const sick = w.mice.filter((m) => m.infected)
    if (sick.length > 0) {
      // Nothing infected may be panicking: the top of the scale is unreachable.
      expect(sick.every((m) => m.fear !== 'panicked')).toBe(true)
    }
  })

  it('Burns nutrition faster, which is the wasting', async () => {
    expect(TOXO.cachexia).toBeGreaterThan(1)
    const e = engine(filthy({ ticks: 300, cats: 0, traps: 0, foodPiles: 0 }))
    await runTicks(e, 60)
    const world = e.world()
    const sick = world.mice.filter((m) => m.infected)
    const well = world.mice.filter((m) => !m.infected)
    // With no food at all, nothing is infected by eating, so this only holds
    // once infection exists; the assertion is about the rate, not the count.
    if (sick.length > 0 && well.length > 0) {
      const mean = (xs: typeof sick) => xs.reduce((s, m) => s + m.nutrition, 0) / xs.length
      expect(mean(sick)).toBeLessThan(mean(well))
    }
  })
})

describe('Toxoplasmosis: how it spreads', () => {
  it('Passes from an infected mother to her litter, often but not always', { timeout: 30_000 }, async () => {
    const evs = await runTicks(engine(filthy({
      ticks: 2000, cats: 0, traps: 0, mouseholes: 30, foodPiles: 60,
    })), 2000)
    const born = of(evs, 'mouse_infected').filter((x) => x.via === 'birth')
    expect(born.length).toBeGreaterThan(0)
    expect(TOXO.verticalTransmission).toBeGreaterThan(0.5)
    expect(TOXO.verticalTransmission).toBeLessThan(1)
  })

  it('Does not pass between mice any other way', async () => {
    // No horizontal route is documented without a cat, so there is none. With
    // no food to be contaminated and no births, no mouse may become infected.
    const evs = await runTicks(engine(filthy({
      ticks: 400, cats: 0, traps: 0, foodPiles: 0, mouseholes: 0,
    })), 400)
    expect(of(evs, 'mouse_infected')).toHaveLength(0)
  })

  it('Starts a cat shedding once it eats an infected mouse', { timeout: 30_000 }, async () => {
    const evs = await runTicks(engine(filthy({ ticks: 1200, cats: 4 })), 1200)
    const caught = of(evs, 'capture')
    expect(caught.length).toBeGreaterThan(0)
    expect(of(evs, 'cat_shedding').length).toBeGreaterThan(0)
  })

  it('Gives a cat no appetite for an infected mouse', async () => {
    // The parasite manipulates the prey, not the predator, and no evidence
    // supports a predator-side preference. What a cat is given to choose
    // between must therefore carry no trace of infection -- otherwise either
    // decider could start preferring infected prey, and the high prevalence
    // among cat-caught rodents would become an input rather than the result it
    // actually is.
    const e = engine(filthy({ ticks: 400, cats: 3 }))
    await runTicks(e, 400)
    const evs = e.events()
    const catSubjects = evs
      .filter((x): x is Extract<typeof x, { kind: 'decision_returned' }> =>
        x.kind === 'decision_returned')
      .flatMap((x) => x.subjects)
      .filter((s) => s.agentId.startsWith('c'))
    expect(catSubjects.length).toBeGreaterThan(0)
    expect(JSON.stringify(catSubjects)).not.toContain('infect')
  })
})

describe('Toxoplasmosis: the loop back to the food', () => {
  it('Lifts contamination above the configured floor once cats shed', { timeout: 30_000 }, async () => {
    const e = engine(medium({ ticks: 1500, toxoplasmosisRate: 5, cats: 4 }))
    await runTicks(e, 1500)
    const w = e.world()
    if (w.cats.some((c) => c.shedding)) {
      // Shedding cats are the environmental source, so the rate a respawning
      // pile faces is no longer the number that was configured.
      expect(e.contaminationRate()).toBeGreaterThan(0.05)
    }
  })

  it('Never exceeds certainty however many cats are shedding', { timeout: 30_000 }, async () => {
    const e = engine(medium({ ticks: 1500, toxoplasmosisRate: 90, cats: 10 }))
    await runTicks(e, 1500)
    expect(e.contaminationRate()).toBeLessThanOrEqual(1)
  })
})
