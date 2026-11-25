import { describe, expect, it } from 'vitest'
import { buildSuggestionPool, resolveCasing } from './componentSuggestions'

describe('buildSuggestionPool', () => {
  const saved = [
    { brand: 'Shimano', model: 'CS-R8100', category: 'cassette' },
    { brand: 'KMC', model: 'X11', category: 'chain' },
  ]

  it('merges unsaved rows into the saved components, case-insensitively', () => {
    const pool = buildSuggestionPool(saved, [
      { brand: 'shimano', model: null, category: 'chain' },
      { brand: 'SRAM', model: 'PG-1170', category: 'cassette' },
      { brand: null, model: null, category: 'tire_front' },
    ])
    expect(pool.brands).toEqual([
      { brand: 'Shimano', count: 2 },
      { brand: 'KMC', count: 1 },
      { brand: 'SRAM', count: 1 },
    ])
    expect(pool.models.map((m) => m.model).sort()).toEqual(['CS-R8100', 'PG-1170', 'X11'])
  })

  it('is just the saved components with no extra', () => {
    expect(buildSuggestionPool(saved).brands).toHaveLength(2)
  })
})

describe('resolveCasing', () => {
  it('trims and adopts a matching suggestion casing', () => {
    expect(resolveCasing('  shimano ', ['Shimano', 'SRAM'])).toBe('Shimano')
    expect(resolveCasing(' Campy ', ['Shimano'])).toBe('Campy')
  })
})
