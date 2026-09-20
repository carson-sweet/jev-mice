// US-E02-01 Numbers become words
// Satisfies FR-072 and the decision contract. Verifies SM-02.
import { describe, it, expect } from 'vitest'
import { bucketNutrition, bucketDistance, bucketAge, composeRequests } from '../../src/index.js'
import { engine, medium } from '../helpers.js'

describe('US-E02-01 Numbers become words', () => {
  it('Nutrition is bucketed', () => {
    expect([95, 70, 45, 20, 5].map(bucketNutrition))
      .toEqual(['full', 'fed', 'hungry', 'very hungry', 'starving'])
  })

  it('Nutrition boundaries sit exactly on the movement bands', () => {
    expect(bucketNutrition(60)).toBe('fed')
    expect(bucketNutrition(59)).toBe('hungry')
    expect(bucketNutrition(30)).toBe('hungry')
    expect(bucketNutrition(29)).toBe('very hungry')
  })

  it('Distance is bucketed', () => {
    expect([1, 3, 5, 9].map(bucketDistance))
      .toEqual(['adjacent', 'very close', 'nearby', 'far'])
  })

  it('Age is bucketed', () => {
    expect(bucketAge(10)).toMatch(/pup/)
    expect(bucketAge(100)).toMatch(/young adult/)
    expect(bucketAge(500)).toMatch(/grown adult/)
  })

  it('No number reaches the model', () => {
    const e = engine(medium())
    const ready = e.world().mice.slice(0, 4).map((m) => m.id)
    for (const req of composeRequests(e.world(), ready)) {
      const json = JSON.stringify(req.state)
      expect(json, 'a numeral reached the state sent to the model').not.toMatch(/\d/)
    }
  })
})
