import { describe, expect, it } from 'vitest'
import { installationActions, intervalCountLabel, lifetimeLine, serviceStatusRows, whereItIs, whereItIsText } from './installationModel'
import type { ComponentServiceRequirementWithStatus } from '../../types/models'

const now = new Date(2026, 10, 24, 12)
const day = (year: number, month: number, date: number) => new Date(year, month, date, 12).toISOString()
const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fullDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const current = { bike_id: 2, started_at: day(2026, 9, 15), ended_at: null, ride_context: 'both' as const }

describe('whereItIs / whereItIsText', () => {
  it('reads "On <bike> since <date> · <context>" for a current installation', () => {
    const where = whereItIs(current, 'Soloist', [{ id: 2, name: 'Soloist', ride_context: 'both' }])
    expect(where).toMatchObject({ kind: 'current', bike: { id: 2, name: 'Soloist' }, alsoOn: [] })
    expect(whereItIsText(where, now)).toBe(`On Soloist since ${shortDay(current.started_at)} · All rides`)
  })

  it('adds "· also on <other bikes>" for a shared cassette, leaving this bike out', () => {
    const shared = { ...current, ride_context: 'indoor_only' as const }
    const where = whereItIs(shared, 'Soloist', [
      { id: 2, name: 'Soloist', ride_context: 'indoor_only' },
      { id: 4, name: 'Zwift rig', ride_context: 'indoor_only' },
      { id: 3, name: 'Juan Solo', ride_context: 'indoor_only' },
    ])
    expect(whereItIsText(where, now)).toBe(`On Soloist since ${shortDay(current.started_at)} · Trainer only · also on Juan Solo, Zwift rig`)
  })

  it('reads "Was on <bike> · <start> → <end> · <context>" for a past one, ignoring current bikes', () => {
    const past = { bike_id: 2, started_at: day(2026, 5, 2), ended_at: day(2026, 8, 30), ride_context: 'outdoor_only' as const }
    const where = whereItIs(past, 'Soloist', [{ id: 5, name: 'Elsewhere', ride_context: 'both' }])
    expect(where.kind).toBe('past')
    expect(whereItIsText(where, now)).toBe(`Was on Soloist · ${shortDay(past.started_at)} → ${fullDay(past.ended_at)} · Outdoor only`)
  })
})

describe('installationActions', () => {
  it('offers Log service, Edit and Remove for a current installation', () => {
    expect(installationActions({ ended_at: null })).toEqual(['log_service', 'edit', 'remove'])
  })

  it('offers only Edit for a past one', () => {
    expect(installationActions({ ended_at: day(2026, 8, 30) })).toEqual(['edit'])
  })
})

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

describe('serviceStatusRows', () => {
  it('gives each enabled interval its name, last done, fraction and what is left', () => {
    const rows = serviceStatusRows(
      [
        requirement({
          id: 1,
          requirement_name: 'Drip wax',
          status: 'warning',
          distance_used_meters: 196_000,
          distance_remaining_meters: 4_000,
          setting_event: { id: 9, service_type_name: 'Drip wax', performed_at: day(2026, 10, 14) },
        }),
        requirement({ id: 2, requirement_name: 'Replace', status: 'due', distance_used_meters: 320_000, distance_remaining_meters: -120_000 }),
        requirement({ id: 3, enabled: false }),
      ],
      now,
    )

    expect(rows.map((row) => row.id)).toEqual([1, 2])
    expect(rows[0]).toMatchObject({ name: 'Drip wax', status: 'warning', remaining: '4 km left', lastDone: `Last done ${shortDay(day(2026, 10, 14))}` })
    expect(rows[0].fraction).toBeCloseTo(0.98)
    expect(rows[1]).toMatchObject({ name: 'Replace', status: 'due', remaining: '120 km over', lastDone: 'Since install' })
  })

  it('is empty with no enabled interval', () => {
    expect(serviceStatusRows([requirement({ enabled: false })], now)).toEqual([])
  })
})

describe('lifetimeLine / intervalCountLabel', () => {
  it('reads the lifetime distance and time across installations', () => {
    expect(lifetimeLine({ total_distance: 17_678_000, total_moving_time: 1_989_720 })).toBe(
      `Lifetime across all installations: ${(17678).toLocaleString()} km · ${(552.7).toLocaleString()} hrs`,
    )
  })

  it('counts intervals', () => {
    expect(intervalCountLabel(2)).toBe('2 intervals')
    expect(intervalCountLabel(1)).toBe('1 interval')
  })
})
