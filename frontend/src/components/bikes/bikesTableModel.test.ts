import { describe, expect, it } from 'vitest'
import { firstDirection, sortBikesTable } from './bikesTableModel'
import type { BikeWithStats } from '../../types/models'

function bike(name: string, overrides: Partial<BikeWithStats> = {}): BikeWithStats {
  return {
    id: name.length,
    name,
    make: null,
    model: null,
    bike_type_id: null,
    retired_on: null,
    total_distance: 0,
    total_moving_time: 0,
    first_ride_on: null,
    last_ride_on: null,
    average_power: null,
    total_elevation_gain: 0,
    installed_components_count: 0,
    ride_count: 0,
    distance_this_year: 0,
    last_ride_activity_type: null,
    status_counts: { due: 0, warning: 0 },
    next_service: [],
    ...overrides,
  } as BikeWithStats
}

const types = new Map([
  [1, 'Road'],
  [2, 'Gravel'],
])
const names = (bikes: BikeWithStats[]) => bikes.map((b) => b.name)

describe('sortBikesTable', () => {
  it('keeps retired bikes last whatever the sort', () => {
    const bikes = [bike('Old', { retired_on: '2025-03-01', total_distance: 999 }), bike('New', { total_distance: 1 })]
    expect(names(sortBikesTable(bikes, 'total_distance', 'desc', types))).toEqual(['New', 'Old'])
    expect(names(sortBikesTable(bikes, 'total_distance', 'asc', types))).toEqual(['New', 'Old'])
  })

  it('sorts nulls last in both directions', () => {
    const bikes = [bike('No power'), bike('Strong', { average_power: 250 }), bike('Steady', { average_power: 180 })]
    expect(names(sortBikesTable(bikes, 'average_power', 'desc', types))).toEqual(['Strong', 'Steady', 'No power'])
    expect(names(sortBikesTable(bikes, 'average_power', 'asc', types))).toEqual(['Steady', 'Strong', 'No power'])
  })

  it('sorts Status by urgency: due outranks warnings', () => {
    const bikes = [
      bike('Fine'),
      bike('Warnings', { status_counts: { due: 0, warning: 3 } }),
      bike('Due', { status_counts: { due: 1, warning: 0 } }),
    ]
    expect(names(sortBikesTable(bikes, 'status', 'desc', types))).toEqual(['Due', 'Warnings', 'Fine'])
  })

  it('sorts Type by its name, bikes without one last', () => {
    const bikes = [bike('A', { bike_type_id: 1 }), bike('B'), bike('C', { bike_type_id: 2 })]
    expect(names(sortBikesTable(bikes, 'bike_type', 'asc', types))).toEqual(['C', 'A', 'B'])
  })

  it('breaks ties by name', () => {
    const bikes = [bike('Zed', { ride_count: 3 }), bike('Abe', { ride_count: 3 })]
    expect(names(sortBikesTable(bikes, 'ride_count', 'desc', types))).toEqual(['Abe', 'Zed'])
  })
})

describe('firstDirection', () => {
  it('starts text A-Z and numbers or dates biggest first', () => {
    expect(firstDirection('name')).toBe('asc')
    expect(firstDirection('bike_type')).toBe('asc')
    expect(firstDirection('total_distance')).toBe('desc')
    expect(firstDirection('last_ride_on')).toBe('desc')
  })
})
