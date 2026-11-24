import { describe, expect, it } from 'vitest'
import { componentPlacement, identityParts, placementText, worstRequirementStatus } from './componentPageModel'
import type { ComponentDetail, ComponentServiceRequirementWithStatus } from '../../types/models'

const now = new Date(2026, 10, 24, 12)
const sameYearDay = (month: number, day: number) => new Date(2026, month, day, 12).toISOString()

function requirement(overrides: Partial<ComponentServiceRequirementWithStatus> = {}): ComponentServiceRequirementWithStatus {
  return {
    id: 1,
    category_service_requirement_id: null,
    enabled: true,
    requirement_name: 'Wax',
    distance_meters: 200_000,
    moving_time_seconds: null,
    calendar_amount: null,
    calendar_unit: null,
    ride_filter: 'all',
    satisfiers: [],
    status: 'ok',
    driving_dimension: 'distance',
    distance_used_meters: 50_000,
    distance_remaining_meters: 150_000,
    moving_time_used_seconds: null,
    moving_time_remaining_seconds: null,
    days_used: null,
    days_remaining: null,
    setting_event: null,
    setting_position: 0,
    ...overrides,
  }
}

function detail(overrides: Partial<ComponentDetail> = {}): ComponentDetail {
  return {
    id: 1,
    label: 'Chain A',
    category: 'chain',
    acquired_on: '2026-03-02',
    retired_on: null,
    brand: null,
    model: null,
    notes: null,
    total_distance: 0,
    service_requirements: [],
    current_bikes: [],
    last_bike: null,
    assignments: [],
    lifetime_stats: { distance_meters: 0, moving_time_seconds: 0, elevation_gain_meters: 0, average_power: null },
    maintenance_events: [],
    maintenance_events_count: 0,
    deletable: true,
    ...overrides,
  }
}

const soloist = { id: 2, name: 'Soloist', ride_context: 'both' as const }
const install = (id: number, bikeId: number, name: string, startedAt: string, endedAt: string | null = null, rideContext: 'both' | 'indoor_only' = 'both') => ({
  id,
  bike: { id: bikeId, name },
  started_at: startedAt,
  ended_at: endedAt,
  ride_context: rideContext,
  distance_meters: 0,
})

describe('worstRequirementStatus', () => {
  it('is the worst enabled status, ignoring disabled ones', () => {
    expect(worstRequirementStatus([requirement({ status: 'ok' }), requirement({ status: 'warning' })])).toBe('warning')
    expect(worstRequirementStatus([requirement({ status: 'ok' }), requirement({ status: 'due', enabled: false })])).toBe('ok')
  })

  it('is null with no enabled interval', () => {
    expect(worstRequirementStatus([])).toBeNull()
    expect(worstRequirementStatus([requirement({ enabled: false })])).toBeNull()
  })
})

describe('componentPlacement / placementText', () => {
  it('reads "On <bike> since <date> · <ride context>" when installed', () => {
    const component = detail({ current_bikes: [soloist], assignments: [install(9, 2, 'Soloist', sameYearDay(9, 15))] })
    const text = placementText(componentPlacement(component), now)
    expect(text).toMatch(/^On Soloist since .*15.* · All rides$/)
    expect(text).not.toMatch(/2026/)
  })

  it('lists both bikes of a shared cassette, A-Z, since the earliest open stint', () => {
    const component = detail({
      current_bikes: [
        { ...soloist, ride_context: 'indoor_only' },
        { id: 3, name: 'Juan Solo', ride_context: 'indoor_only' },
      ],
      assignments: [
        install(10, 2, 'Soloist', sameYearDay(6, 1), null, 'indoor_only'),
        install(11, 3, 'Juan Solo', sameYearDay(5, 2), null, 'indoor_only'),
        install(12, 3, 'Juan Solo', sameYearDay(0, 2), sameYearDay(1, 1)),
      ],
    })
    const placement = componentPlacement(component)
    expect(placement).toMatchObject({ kind: 'installed', bikes: [{ name: 'Juan Solo' }, { name: 'Soloist' }] })
    expect(placementText(placement, now)).toMatch(/^On Juan Solo, Soloist since Jun 2 · Trainer only$/)
  })

  it('reads "Spare · last on <bike>", "Never installed", or "Last on <bike>" when retired', () => {
    const lastBike = { id: 2, name: 'Soloist', removed_at: '2026-02-01T00:00:00Z' }
    expect(placementText(componentPlacement(detail({ last_bike: lastBike })), now)).toBe('Spare · last on Soloist')
    expect(placementText(componentPlacement(detail()), now)).toBe('Never installed')
    expect(placementText(componentPlacement(detail({ retired_on: '2026-03-01', last_bike: lastBike })), now)).toBe('Last on Soloist')
  })
})

describe('identityParts', () => {
  it('leads with brand and model, then the acquired date', () => {
    expect(identityParts(detail({ brand: 'KMC', model: 'X11' }), now)).toEqual(['KMC X11', `Acquired ${new Date(2026, 2, 2).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`])
    expect(identityParts(detail(), now)).toHaveLength(1)
  })
})
