import { describe, expect, it } from 'vitest'
import { appliesToSummary, availableCategories, emptyCategoriesMessage, splitMatch } from './categoryTagInput'

const all = ['chain', 'cassette', 'chainring', 'tire_front']

describe('availableCategories', () => {
  it('excludes selected categories and keeps the canonical order', () => {
    expect(availableCategories(all, ['cassette'], '')).toEqual(['chain', 'chainring', 'tire_front'])
  })

  it('filters by substring of the label or the key, case-insensitively', () => {
    expect(availableCategories(all, [], 'CHAIN')).toEqual(['chain', 'chainring'])
    expect(availableCategories(all, [], 'front tire')).toEqual(['tire_front'])
    expect(availableCategories(all, [], 'tire_')).toEqual(['tire_front'])
    expect(availableCategories(all, ['chain'], 'chain')).toEqual(['chainring'])
  })
})

describe('emptyCategoriesMessage', () => {
  it('says every category is selected only when nothing is left', () => {
    expect(emptyCategoriesMessage(all, all)).toBe('Every category is selected')
    expect(emptyCategoriesMessage(all, ['chain'])).toBe('No matching categories')
  })
})

describe('splitMatch', () => {
  it('splits around the first case-insensitive match, keeping original casing', () => {
    expect(splitMatch('Chainring', 'RING')).toEqual([
      { text: 'Chain', match: false },
      { text: 'ring', match: true },
    ])
  })

  it('returns the whole text unmatched for an empty or missing query', () => {
    expect(splitMatch('Chain', '')).toEqual([{ text: 'Chain', match: false }])
    expect(splitMatch('Chain', 'xyz')).toEqual([{ text: 'Chain', match: false }])
  })
})

describe('appliesToSummary', () => {
  it('describes universal and tagged types', () => {
    expect(appliesToSummary([])).toBe('Pickers show this type on every component. Past events are kept.')
    expect(appliesToSummary(['chain', 'cassette'])).toBe(
      'Pickers show this type on Chain, Cassette components only. Past events are kept.',
    )
  })
})
