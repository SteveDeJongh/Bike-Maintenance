import { describe, expect, it } from 'vitest'
import {
  bikeTileTotals,
  bikesHeaderLine,
  isBikeCardSort,
  isBikesView,
  retiredLabel,
  retiredYearRange,
  sortBikeCards,
} from './bikesList'

function bike(overrides: Partial<Parameters<typeof bikeTileTotals>[0][number]> = {}) {
  return {
    retired_on: null,
    total_distance: 10_000,
    distance_this_year: 4_000,
    installed_components_count: 5,
    status_counts: { due: 0, warning: 0 },
    ...overrides,
  }
}

describe('bikeTileTotals', () => {
  it('sums active bikes and counts retired ones separately', () => {
    const totals = bikeTileTotals([
      bike({ status_counts: { due: 1, warning: 0 } }),
      bike({ total_distance: 2_500, distance_this_year: 0, installed_components_count: 3, status_counts: { due: 0, warning: 2 } }),
      bike({ retired_on: '2025-03-01', total_distance: 99_000, distance_this_year: 1_000, installed_components_count: 9, status_counts: { due: 4, warning: 4 } }),
    ])

    expect(totals).toEqual({
      active: 2,
      retired: 1,
      totalDistance: 12_500,
      thisYear: 4_000,
      components: 8,
      due: 1,
      warning: 2,
    })
  })

  it('is all zeros with no bikes', () => {
    expect(bikeTileTotals([])).toEqual({ active: 0, retired: 0, totalDistance: 0, thisYear: 0, components: 0, due: 0, warning: 0 })
  })
})

describe('bikesHeaderLine', () => {
  it('mentions retired bikes only when there are any', () => {
    expect(bikesHeaderLine({ active: 3, retired: 1 })).toBe('3 active · 1 retired')
    expect(bikesHeaderLine({ active: 2, retired: 0 })).toBe('2 active')
  })
})

describe('saved view values', () => {
  it('accepts only known views and card sorts', () => {
    expect(isBikesView('table')).toBe(true)
    expect(isBikesView('grid')).toBe(false)
    expect(isBikeCardSort('last_ridden')).toBe(true)
    expect(isBikeCardSort(undefined)).toBe(false)
  })
})

describe('sortBikeCards', () => {
  const card = (name: string, due: number, warning: number, lastRide: string | null, distance: number) => ({
    name,
    last_ride_on: lastRide,
    total_distance: distance,
    status_counts: { due, warning },
  })
  const bikes = [
    card('Zwift rig', 0, 0, '2026-11-20T10:00:00Z', 5_000),
    card('Gravel', 0, 2, '2026-10-01T10:00:00Z', 30_000),
    card('Road', 1, 0, '2026-11-01T10:00:00Z', 80_000),
    card('Old MTB', 0, 0, null, 80_000),
  ]
  const names = (sort: Parameters<typeof sortBikeCards>[1]) => sortBikeCards(bikes, sort).map((b) => b.name)

  it('puts the most due, then most warning, then most recently ridden first for Most urgent', () => {
    expect(names('urgent')).toEqual(['Road', 'Gravel', 'Zwift rig', 'Old MTB'])
  })

  it('orders Last ridden newest first, never-ridden last', () => {
    expect(names('last_ridden')).toEqual(['Zwift rig', 'Road', 'Gravel', 'Old MTB'])
  })

  it('orders Distance highest first, ties by name', () => {
    expect(names('distance')).toEqual(['Old MTB', 'Road', 'Gravel', 'Zwift rig'])
  })

  it('orders Name A to Z', () => {
    expect(names('name')).toEqual(['Gravel', 'Old MTB', 'Road', 'Zwift rig'])
  })

  it('does not reorder its input', () => {
    sortBikeCards(bikes, 'name')
    expect(bikes[0].name).toBe('Zwift rig')
  })
})

describe('retiredYearRange', () => {
  it('spans the first to the last year ridden', () => {
    expect(retiredYearRange({ first_ride_on: '2019-04-02T10:00:00Z', last_ride_on: '2024-09-30T10:00:00Z' })).toBe('2019–2024')
  })

  it('is one year when both fall in it', () => {
    expect(retiredYearRange({ first_ride_on: '2022-04-02T10:00:00Z', last_ride_on: '2022-09-30T10:00:00Z' })).toBe('2022')
  })

  it('is empty for a bike never ridden', () => {
    expect(retiredYearRange({ first_ride_on: null, last_ride_on: null })).toBe('')
  })
})

describe('retiredLabel', () => {
  it('reads the retirement month and year', () => {
    expect(retiredLabel('2025-03-01')).toBe('Retired Mar 2025')
  })
})
