import { describe, expect, it } from 'vitest'
import { componentsCellState, rideHeaderParts, rideStatLines, serviceNearbyLabel } from './rideDetail'

const full = {
  distance_meters: 48_000, moving_time: 5_400, total_elevation_gain: 512, average_watts: 180.4,
  elapsed_time: 6_000, average_speed: 8, max_speed: 15, weighted_average_watts: 195, kilojoules: 974.7,
  average_heartrate: 141.6, max_heartrate: 178, average_cadence: 86.2,
}

describe('rideStatLines', () => {
  it('puts distance, moving time, elevation and avg power on line 1, the rest on line 2', () => {
    const { primary, secondary } = rideStatLines(full)
    expect(primary.map((s) => s.label)).toEqual(['Distance', 'Moving time', 'Elevation', 'Avg power'])
    expect(primary[3].value).toBe('180 W')
    expect(secondary.map((s) => s.label)).toEqual([
      'Elapsed', 'Avg speed', 'Max speed', 'Weighted power', 'Energy', 'Avg HR', 'Max HR', 'Cadence',
    ])
  })

  it('promotes the next recorded metric into line 1 when avg power is missing', () => {
    const { primary, secondary } = rideStatLines({ ...full, average_watts: null, elapsed_time: null })
    expect(primary.map((s) => s.label)).toEqual(['Distance', 'Moving time', 'Elevation', 'Avg speed'])
    expect(secondary.map((s) => s.label)).not.toContain('Avg speed')
    expect(secondary.map((s) => s.label)).not.toContain('Elapsed')
  })

  it('hides null metrics rather than showing a dash, even when line 1 can\'t fill', () => {
    const sparse = {
      ...full, moving_time: null, total_elevation_gain: null, average_watts: null, elapsed_time: null,
      average_speed: null, max_speed: null, weighted_average_watts: null, kilojoules: null,
      average_heartrate: null, max_heartrate: null, average_cadence: 90,
    }
    const { primary, secondary } = rideStatLines(sparse)
    expect(primary.map((s) => s.label)).toEqual(['Distance', 'Cadence'])
    expect(secondary).toEqual([])
  })
})

describe('rideHeaderParts', () => {
  it('formats the date and time, sport type and context', () => {
    const local = new Date(2026, 10, 22, 8, 12) // Sun, Nov 22, 8:12 am local
    const parts = rideHeaderParts({ moved_at: local.toISOString(), activity_type: 'GravelRide', indoor: false })
    expect(parts).toEqual({ when: 'Sun, Nov 22 · 8:12 am', sport: 'Gravel Ride', context: 'Outdoor' })
  })

  it('reads indoor and tolerates a missing sport type', () => {
    const parts = rideHeaderParts({ moved_at: new Date(2026, 0, 5, 18, 0).toISOString(), activity_type: null, indoor: true })
    expect(parts.sport).toBeNull()
    expect(parts.context).toBe('Indoor')
  })
})

describe('serviceNearbyLabel', () => {
  it('says before or after this ride', () => {
    const at = new Date(2026, 10, 20, 9, 0).toISOString()
    expect(serviceNearbyLabel({ occurred_at: at, position: 'before' })).toBe('Fri, Nov 20 · before this ride')
    expect(serviceNearbyLabel({ occurred_at: at, position: 'after' })).toBe('Fri, Nov 20 · after this ride')
  })
})

describe('componentsCellState', () => {
  it('reads No bike, None, or the list', () => {
    expect(componentsCellState({ bike: null, counted_toward: [] })).toBe('no_bike')
    expect(componentsCellState({ bike: { id: 1 }, counted_toward: [] })).toBe('none')
    expect(componentsCellState({ counted_toward: [] })).toBe('none') // ride history rows carry no bike field
    expect(componentsCellState({ bike: { id: 1 }, counted_toward: [{}] })).toBe('list')
  })
})
