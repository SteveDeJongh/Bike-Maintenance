import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bikeStatusCounts, lastRideLine, rotationGroups, sortBikesByUrgency, sortByWear, wearMetricLabel } from './bikeCard'
import type { DashboardMountedComponent, DashboardOffBikeComponent } from '../types/models'

const metric = { requirement_name: null, distance_meters: null, moving_time_seconds: null, days: null, since_service_type_name: null }
const noWear = {
  fraction_used: null,
  driving_dimension: null,
  distance_remaining_meters: null,
  moving_time_remaining_seconds: null,
  days_remaining: null,
  total_distance_meters: null,
}

function mounted(id: number, category: string, extra: Partial<DashboardMountedComponent> = {}): DashboardMountedComponent {
  return {
    component_id: id,
    assignment_id: id,
    label: `${category} ${id}`,
    category,
    ride_context: 'both',
    service_status: null,
    display_metric: metric,
    ...noWear,
    ...extra,
  }
}

function offBike(id: number, category: string, rotates = true): DashboardOffBikeComponent {
  return {
    component_id: id,
    label: `${category} ${id}`,
    category,
    rotates,
    service_status: null,
    last_service_at: null,
    display_metric: metric,
    ...noWear,
  }
}

describe('bikeStatusCounts', () => {
  it('counts due and warning mounted components', () => {
    const components = [
      mounted(1, 'chain', { service_status: 'due' }),
      mounted(2, 'tire', { service_status: 'warning' }),
      mounted(3, 'cassette', { service_status: 'warning' }),
      mounted(4, 'saddle', { service_status: 'ok' }),
      mounted(5, 'bar_tape'),
    ]
    expect(bikeStatusCounts(components)).toEqual({ due: 1, warning: 2 })
  })
})

describe('sortByWear', () => {
  it('puts the most worn first and components without a requirement last', () => {
    const sorted = sortByWear([
      mounted(1, 'a', { fraction_used: 0.2 }),
      mounted(2, 'b'),
      mounted(3, 'c', { fraction_used: 1.4 }),
      mounted(4, 'd', { fraction_used: 0.6 }),
    ])
    expect(sorted.map((component) => component.component_id)).toEqual([3, 4, 1, 2])
  })
})

describe('wearMetricLabel', () => {
  const wear = (requirementName: string | null, category = 'chain') =>
    mounted(1, category, {
      driving_dimension: 'distance',
      distance_remaining_meters: 8_000,
      display_metric: { ...metric, requirement_name: requirementName },
    })

  it('appends a requirement name the category does not already say', () => {
    expect(wearMetricLabel(wear('Wax'))).toBe('8 km left · wax')
  })

  it('leaves it off when the name already names the category', () => {
    expect(wearMetricLabel(wear('Chain replacement'))).toBe('8 km left')
    expect(wearMetricLabel(wear('Replace front tire', 'tire_front'))).toBe('8 km left')
  })

  it('shows over amounts', () => {
    expect(wearMetricLabel({ ...wear('Wax'), distance_remaining_meters: -120_000 })).toBe('120 km over · wax')
  })

  it('shows the lifetime total with no requirement', () => {
    expect(wearMetricLabel(mounted(1, 'saddle', { display_metric: { ...metric, distance_meters: 2_140_000 } }))).toBe('2,140 km total')
  })
})

describe('rotationGroups', () => {
  it('pairs off-bike components with mounted ones of the same category', () => {
    const chainA = mounted(1, 'chain')
    const { groups, unpaired } = rotationGroups([chainA, mounted(2, 'tire_front')], [offBike(3, 'chain'), offBike(4, 'chain'), offBike(5, 'saddle')])

    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBe('chain')
    expect(groups[0].mounted).toEqual([chainA])
    expect(groups[0].offBike.map((component) => component.component_id)).toEqual([3, 4])
    expect(unpaired.map((component) => component.component_id)).toEqual([5])
  })

  it('pairs any category set to rotate, not just chain', () => {
    const { groups } = rotationGroups([mounted(1, 'tire_front')], [offBike(2, 'tire_front', true)])
    expect(groups.map((group) => group.category)).toEqual(['tire_front'])
  })

  it('leaves a non-rotating category unpaired even with a mounted partner', () => {
    const { groups, unpaired } = rotationGroups([mounted(1, 'tire_front')], [offBike(2, 'tire_front', false)])
    expect(groups).toEqual([])
    expect(unpaired.map((component) => component.component_id)).toEqual([2])
  })

  it('has nothing to pair with no off-bike components', () => {
    expect(rotationGroups([mounted(1, 'chain')], [])).toEqual({ groups: [], unpaired: [] })
  })
})

describe('sortBikesByUrgency', () => {
  const bike = (name: string, statuses: ('due' | 'warning' | 'ok')[], lastRide: string | null) => ({
    name,
    last_ride_on: lastRide,
    mounted: statuses.map((status) => ({ service_status: status })),
  })

  it('orders by due count, then warning count, then most recent ride, then name', () => {
    const sorted = sortBikesByUrgency([
      bike('Never ridden', [], null),
      bike('Recent', ['ok'], '2026-11-19T10:00:00Z'),
      bike('Two warnings', ['warning', 'warning'], '2026-01-01T10:00:00Z'),
      bike('One due', ['due', 'ok'], '2025-06-01T10:00:00Z'),
      bike('One warning', ['warning'], '2026-11-19T10:00:00Z'),
      bike('Older', ['ok'], '2026-10-01T10:00:00Z'),
      bike('Also recent', [], '2026-11-19T10:00:00Z'),
    ])
    expect(sorted.map((b) => b.name)).toEqual(['One due', 'Two warnings', 'One warning', 'Also recent', 'Recent', 'Older', 'Never ridden'])
  })
})

describe('lastRideLine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 24, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const ride = (year: number, month: number, day: number, type: string | null) => ({
    last_ride_on: new Date(year, month, day, 12).toISOString(),
    last_ride_activity_type: type,
  })

  it('leaves the year out for a ride this year', () => {
    const line = lastRideLine(ride(2026, 10, 16, 'GravelRide'))
    expect(line).toMatch(/^Last ride .*16 · Gravel Ride$/)
    expect(line).not.toMatch(/2026/)
  })

  it('includes the year for a ride last year', () => {
    expect(lastRideLine(ride(2025, 2, 2, 'Ride'))).toMatch(/^Last ride .*2025 · Ride$/)
  })

  it('drops the sport when Strava gave none', () => {
    expect(lastRideLine(ride(2026, 10, 16, null))).toMatch(/^Last ride [^·]*16$/)
  })

  it('says so when there are no rides', () => {
    expect(lastRideLine({ last_ride_on: null, last_ride_activity_type: null })).toBe('No rides yet')
  })
})
