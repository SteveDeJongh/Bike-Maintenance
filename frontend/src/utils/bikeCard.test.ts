import { describe, expect, it } from 'vitest'
import { bikeStatusCounts, rotationGroups, sortBikesByUrgency, sortByWear, wearMetricLabel } from './bikeCard'
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

function offBike(id: number, category: string): DashboardOffBikeComponent {
  return { component_id: id, label: `${category} ${id}`, category, display_metric: metric, ...noWear }
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

  it('is not chain-specific', () => {
    const { groups } = rotationGroups([mounted(1, 'tire_front')], [offBike(2, 'tire_front')])
    expect(groups.map((group) => group.category)).toEqual(['tire_front'])
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
