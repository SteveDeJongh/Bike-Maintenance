import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import {
  componentCountLabel,
  deleteSessionMessage,
  eventDistanceLines,
  moveHint,
  sessionDateTitle,
  sessionEditError,
  sessionStats,
} from './sessionModel'

describe('sessionDateTitle', () => {
  it('reads "Sat, Nov 14, 2026 · 4:10 pm"', () => {
    expect(sessionDateTitle('2026-11-14T16:10:00')).toBe('Sat, Nov 14, 2026 · 4:10 pm')
  })
})

describe('sessionStats', () => {
  const now = new Date(2026, 10, 25)

  it('lists Bike km, Last ride before and Logged', () => {
    const stats = sessionStats(
      {
        bike_distance_at_meters: 1_160_000,
        last_ride_before: { name: 'Hill repeats', distance_meters: 62_000, moved_at: '2026-11-14T09:00:00' },
        created_at: '2026-11-14T17:00:00',
      },
      now,
    )
    expect(stats).toEqual([
      { label: 'Bike km', value: '1,160 km' },
      { label: 'Last ride before', value: 'Hill repeats · 62 km' },
      { label: 'Logged', value: 'Nov 14' },
    ])
  })

  it('hides the ones that are missing', () => {
    const stats = sessionStats({ bike_distance_at_meters: 0, last_ride_before: null, created_at: '2026-11-14T17:00:00' }, now)
    expect(stats.map((stat) => stat.label)).toEqual(['Bike km', 'Logged'])
  })
})

describe('the services list', () => {
  it('counts distinct components and reads each row', () => {
    expect(componentCountLabel([{ component_id: 1 }, { component_id: 1 }, { component_id: 2 }])).toBe('2 components')
    expect(componentCountLabel([{ component_id: 1 }])).toBe('1 component')
    expect(eventDistanceLines({ component_distance_at_event_meters: 1_160_000, since_last_same_type_meters: 200_000 })).toEqual({
      at: 'at 1,160 km',
      since: '200 km since last',
    })
    expect(eventDistanceLines({ component_distance_at_event_meters: 0, since_last_same_type_meters: null }).since).toBeNull()
  })
})

describe('editing', () => {
  it('shows the 422 that names the components, or a fallback', () => {
    const rejected = new ApiError(422, { base: ['Chain S1, Cassette would no longer be eligible at that time'] })
    expect(sessionEditError(rejected)).toBe('Chain S1, Cassette would no longer be eligible at that time')
    expect(sessionEditError(new ApiError(500, null))).toBe('Request failed: 500')
  })

  it('words the move hint and the delete confirm', () => {
    expect(moveHint(3, 'Libre')).toBe('Moves all 3 services. Each component must have been on Libre (or off the bike) at the new time.')
    expect(deleteSessionMessage(1)).toBe('Delete this service session and its 1 service? This cannot be undone.')
  })
})
