import { describe, expect, it } from 'vitest'
import { bikeColumnSortKey, bikeColumnState } from './componentBike'

const mounted = { current_bikes: [{ id: 1, name: 'Soloist', ride_context: 'both' as const }], last_bike: null }
const lastOn = { current_bikes: [], last_bike: { id: 2, name: 'Juan Solo', removed_at: '2026-03-01T09:00:00Z' } }
const never = { current_bikes: [], last_bike: null }

describe('bikeColumnState', () => {
  it('reads mounted, last on, or never installed', () => {
    expect(bikeColumnState(mounted)).toBe('mounted')
    expect(bikeColumnState(lastOn)).toBe('last_on')
    expect(bikeColumnState(never)).toBe('never')
  })
})

describe('bikeColumnSortKey', () => {
  it('puts mounted bikes before last-on bikes, whatever the names', () => {
    const keys = [lastOn, mounted].map(bikeColumnSortKey) as string[]
    keys.sort((a, b) => a.localeCompare(b))
    expect(keys).toEqual(['0 Soloist', '1 Juan Solo'])
  })

  it('sorts by name within a group', () => {
    const a = { current_bikes: [], last_bike: { id: 3, name: 'Allez', removed_at: '' } }
    expect(bikeColumnSortKey(a)!.localeCompare(bikeColumnSortKey(lastOn)!)).toBeLessThan(0)
  })

  it('is null when never installed, so it sorts last', () => {
    expect(bikeColumnSortKey(never)).toBeNull()
  })
})
