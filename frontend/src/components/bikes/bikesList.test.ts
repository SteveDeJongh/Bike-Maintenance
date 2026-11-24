import { describe, expect, it } from 'vitest'
import { bikeTileTotals, bikesHeaderLine, isBikeCardSort, isBikesView } from './bikesList'

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
