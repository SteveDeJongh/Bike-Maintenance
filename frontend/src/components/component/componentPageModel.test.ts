import { describe, expect, it } from 'vitest'
import {
  componentPlacement,
  eventNoteLine,
  identityParts,
  installationRangeText,
  installationsSummary,
  maintenanceSummary,
  intervalsSummary,
  lastDoneText,
  orderRequirements,
  placementText,
  requirementProgressText,
  requirementRuleText,
  worstRequirementStatus,
} from './componentPageModel'
import type { ComponentDetail, ComponentMaintenanceEvent, ComponentServiceRequirementWithStatus } from '../../types/models'

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

const satisfier = (id: number, name: string, position: number) => ({
  id,
  service_type_id: id,
  service_type_name: name,
  position,
  allowance_distance_meters: null,
  allowance_moving_time_seconds: null,
  allowance_calendar_amount: null,
  allowance_calendar_unit: null,
})

describe('requirementRuleText', () => {
  it('reads "Every 200 km · Drip wax or Immersion wax", satisfiers in position order', () => {
    const rule = requirementRuleText(
      requirement({ satisfiers: [satisfier(2, 'Immersion wax', 2), satisfier(1, 'Drip wax', 1)] }),
    )
    expect(rule).toBe('Every 200 km · Drip wax or Immersion wax')
  })

  it('joins every threshold with "or", and names a ride filter', () => {
    const rule = requirementRuleText(
      requirement({
        distance_meters: 3_000_000,
        moving_time_seconds: 36_000,
        calendar_amount: 90,
        calendar_unit: 'day',
        ride_filter: 'outdoor',
        satisfiers: [satisfier(1, 'Replace', 1)],
      }),
    )
    expect(rule).toBe('Every 3,000 km or 10 hrs or 90 days · Replace · outdoor rides only')
  })

  it('uses the singular for one calendar unit, and skips what is missing', () => {
    expect(requirementRuleText(requirement({ distance_meters: null, calendar_amount: 1, calendar_unit: 'year' }))).toBe('Every 1 year')
    expect(requirementRuleText(requirement({ distance_meters: null }))).toBe('')
  })
})

describe('requirementProgressText', () => {
  it('reads "used / total" on the driving dimension, since the setting service', () => {
    const r = requirement({
      distance_used_meters: 196_000,
      distance_remaining_meters: 4_000,
      setting_event: { id: 1, service_type_name: 'Drip wax', performed_at: '2026-11-14T10:00:00Z' },
    })
    expect(requirementProgressText(r)).toBe('196 / 200 km since Drip wax')
  })

  it('reads "since install" before any service, and handles days and overdue', () => {
    const days = requirement({ driving_dimension: 'days', days_used: 100, days_remaining: -10 })
    expect(requirementProgressText(days)).toBe('100 / 90 days since install')
  })
})

describe('lastDoneText', () => {
  it('reads "Last done <date>" or "Since install"', () => {
    const done = requirement({ setting_event: { id: 1, service_type_name: 'Wax', performed_at: new Date(2026, 10, 14, 12).toISOString() } })
    expect(lastDoneText(done, now)).toMatch(/^Last done .*14$/)
    expect(lastDoneText(requirement(), now)).toBe('Since install')
  })
})

describe('intervalsSummary / orderRequirements', () => {
  it('counts every interval, and due/soon among enabled ones', () => {
    const list = [
      requirement({ id: 1, status: 'due' }),
      requirement({ id: 2, status: 'warning' }),
      requirement({ id: 3, status: 'due', enabled: false }),
    ]
    expect(intervalsSummary(list)).toBe('3 intervals · 1 due · 1 soon')
    expect(intervalsSummary([requirement()])).toBe('1 interval')
    expect(intervalsSummary([])).toBe('No intervals')
  })

  it('puts enabled intervals before disabled ones', () => {
    const list = [requirement({ id: 1, enabled: false }), requirement({ id: 2 }), requirement({ id: 3 })]
    expect(orderRequirements(list).map((r) => r.id)).toEqual([2, 3, 1])
  })
})

describe('installationRangeText', () => {
  const day = (year: number, month: number, date: number) => new Date(year, month, date, 12).toISOString()
  const fmt = (iso: string, withYear: boolean) =>
    new Date(iso).toLocaleDateString(undefined, withYear ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', day: 'numeric' })

  it('reads "<start, year> → now · <context>" for the current stint', () => {
    const started = day(2026, 9, 15)
    expect(installationRangeText(install(1, 2, 'Soloist', started))).toBe(`${fmt(started, true)} → now · All rides`)
  })

  it('leaves the start year off when the stint ends the same year', () => {
    const started = day(2026, 5, 2)
    const ended = day(2026, 8, 30)
    expect(installationRangeText(install(1, 2, 'Soloist', started, ended, 'indoor_only'))).toBe(
      `${fmt(started, false)} → ${fmt(ended, true)} · Trainer only`,
    )
  })

  it('keeps both years across a new year', () => {
    const started = day(2025, 11, 1)
    const ended = day(2026, 1, 1)
    expect(installationRangeText(install(1, 2, 'Soloist', started, ended))).toBe(`${fmt(started, true)} → ${fmt(ended, true)} · All rides`)
  })
})

describe('installationsSummary / maintenanceSummary', () => {
  it('counts installations and distinct bikes', () => {
    const list = [install(1, 2, 'Soloist', day0()), install(2, 3, 'Juan Solo', day0()), install(3, 2, 'Soloist', day0())]
    expect(installationsSummary(list)).toBe('3 installations · 2 bikes')
    expect(installationsSummary(list.slice(0, 1))).toBe('1 installation · 1 bike')
    expect(installationsSummary([])).toBe('Never installed')
  })

  it('counts events', () => {
    expect(maintenanceSummary(7)).toBe('7 events')
    expect(maintenanceSummary(1)).toBe('1 event')
    expect(maintenanceSummary(0)).toBe('No events')
  })
})

function day0() {
  return new Date(2026, 0, 1, 12).toISOString()
}

describe('eventNoteLine', () => {
  const event = (overrides: Partial<ComponentMaintenanceEvent> = {}): ComponentMaintenanceEvent => ({
    id: 1,
    component_id: 1,
    service_type_id: 1,
    service_type_name: 'Drip wax',
    performed_at: '2026-11-14T10:00:00Z',
    notes: null,
    service_session_id: null,
    component_distance_at_event_meters: 0,
    mounted_at_event: true,
    session_components: [],
    ...overrides,
  })

  it('joins the notes, the session and "Off the bike"', () => {
    expect(
      eventNoteLine(event({ notes: ' Two coats ', service_session_id: 4, session_components: [{ id: 2, label: 'Cassette' }, { id: 3, label: 'Chain B' }] })),
    ).toBe('Two coats · Session with Cassette, Chain B')
    expect(eventNoteLine(event({ mounted_at_event: false }))).toBe('Off the bike')
    expect(eventNoteLine(event())).toBe('')
  })
})
