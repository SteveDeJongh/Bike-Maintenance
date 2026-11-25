import { describe, expect, it } from 'vitest'
import {
  defaultServiceTypeId,
  lastRideEnd,
  lastRideLine,
  MAX_RECENT_PILLS,
  primaryAction,
  resetRows,
  resetsTitle,
  servicePills,
  sessionLockText,
} from './logServiceModel'
import type { ComponentMaintenanceEvent, ComponentServiceRequirementWithStatus, ServiceStatus } from '../../types/models'

function requirement(
  id: number,
  name: string,
  satisfiers: [number, string, number][],
  overrides: Partial<ComponentServiceRequirementWithStatus> = {},
): ComponentServiceRequirementWithStatus {
  return {
    id,
    category_service_requirement_id: null,
    enabled: true,
    requirement_name: name,
    distance_meters: 200_000,
    moving_time_seconds: null,
    calendar_amount: null,
    calendar_unit: null,
    ride_filter: 'all',
    satisfiers: satisfiers.map(([typeId, typeName, position]) => ({
      id: typeId * 10,
      service_type_id: typeId,
      service_type_name: typeName,
      position,
      allowance_distance_meters: null,
      allowance_moving_time_seconds: null,
      allowance_calendar_amount: null,
      allowance_calendar_unit: null,
    })),
    status: 'ok' as ServiceStatus,
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

function event(id: number, typeId: number, typeName: string, performedAt: string): ComponentMaintenanceEvent {
  return {
    id,
    component_id: 1,
    service_type_id: typeId,
    service_type_name: typeName,
    performed_at: performedAt,
    notes: null,
    service_session_id: null,
    component_distance_at_event_meters: 0,
    mounted_at_event: true,
    session_components: [],
  } as ComponentMaintenanceEvent
}

describe('servicePills', () => {
  it('lists satisfiers by requirement then position, merging a shared type, then recent others, newest first', () => {
    const pills = servicePills({
      service_requirements: [
        requirement(1, 'Wax', [
          [12, 'Hot wax', 2],
          [11, 'Drip wax', 1],
        ]),
        requirement(2, 'Clean', [[11, 'Drip wax', 1], [13, 'Degrease', 2]]),
        requirement(3, 'Off', [[19, 'Ignored', 1]], { enabled: false }),
      ],
      maintenance_events: [
        event(1, 21, 'Inspect', '2026-10-01T00:00:00Z'),
        event(2, 11, 'Drip wax', '2026-11-01T00:00:00Z'),
        event(3, 22, 'Lube', '2026-11-10T00:00:00Z'),
        event(4, 21, 'Inspect', '2026-11-12T00:00:00Z'),
      ],
    })
    expect(pills.map((pill) => [pill.name, pill.requirementNames.join(', ')])).toEqual([
      ['Drip wax', 'Wax, Clean'],
      ['Hot wax', 'Wax'],
      ['Degrease', 'Clean'],
      ['Inspect', ''],
      ['Lube', ''],
    ])
  })

  it(`caps recent types at ${MAX_RECENT_PILLS}`, () => {
    const events = [1, 2, 3, 4, 5].map((n) => event(n, 30 + n, `Type ${n}`, `2026-11-0${n}T00:00:00Z`))
    const pills = servicePills({ service_requirements: [], maintenance_events: events })
    expect(pills.map((pill) => pill.name)).toEqual(['Type 5', 'Type 4', 'Type 3'])
  })
})

describe('defaultServiceTypeId', () => {
  const requirements = [
    requirement(1, 'Clean', [[13, 'Degrease', 1]], { status: 'warning' }),
    requirement(2, 'Wax', [[12, 'Hot wax', 2], [11, 'Drip wax', 1]], { status: 'due' }),
  ]

  it('takes the preselected type, else the most urgent requirement first satisfier, else none', () => {
    expect(defaultServiceTypeId({ service_requirements: requirements }, 13)).toBe(13)
    expect(defaultServiceTypeId({ service_requirements: requirements })).toBe(11)
    expect(defaultServiceTypeId({ service_requirements: [] })).toBeUndefined()
    expect(defaultServiceTypeId(undefined)).toBeUndefined()
  })

  it('breaks a status tie by how far along each is', () => {
    const tied = [
      requirement(1, 'A', [[1, 'One', 1]], { distance_used_meters: 10_000, distance_remaining_meters: 190_000 }),
      requirement(2, 'B', [[2, 'Two', 1]], { distance_used_meters: 150_000, distance_remaining_meters: 50_000 }),
    ]
    expect(defaultServiceTypeId({ service_requirements: tied })).toBe(2)
  })
})

describe('primaryAction', () => {
  it('reads "Log <type>" or "Save changes", disabled with a reason until a component and a type are chosen', () => {
    expect(primaryAction({ isEdit: false, hasComponent: true, serviceTypeName: 'Drip wax' })).toEqual({ label: 'Log Drip wax', disabledReason: null })
    expect(primaryAction({ isEdit: false, hasComponent: false, serviceTypeName: null })).toEqual({
      label: 'Log service',
      disabledReason: 'Pick a component first',
    })
    expect(primaryAction({ isEdit: false, hasComponent: true, serviceTypeName: null }).disabledReason).toBe('Pick a service type')
    expect(primaryAction({ isEdit: true, hasComponent: true, serviceTypeName: 'Drip wax' })).toEqual({ label: 'Save changes', disabledReason: null })
  })
})

describe('the last ride', () => {
  const ride = { name: 'Hill repeats', moved_at: '2026-11-14T09:15:00', elapsed_time: 3_600 }

  it('ends at start plus elapsed time, never after now', () => {
    expect(lastRideEnd(ride, new Date('2026-11-20T00:00:00')).toISOString()).toBe(new Date('2026-11-14T10:15:00').toISOString())
    const now = new Date('2026-11-14T09:30:00')
    expect(lastRideEnd(ride, now)).toEqual(now)
    expect(lastRideEnd({ ...ride, elapsed_time: null }, new Date('2026-11-20')).toISOString()).toBe(new Date(ride.moved_at).toISOString())
  })

  it('reads "Last ride before this: Hill repeats, Nov 14, 9:15 am"', () => {
    expect(lastRideLine(ride)).toBe('Last ride before this: Hill repeats, Nov 14, 9:15 am')
    expect(lastRideLine(null)).toBe('No ride on this component before this')
  })
})

describe('sessionLockText', () => {
  it('names the session date and bike', () => {
    expect(sessionLockText({ performed_at: '2026-11-14T09:00:00' }, 'Libre')).toBe('Part of the Nov 14 service session on Libre')
    expect(sessionLockText(undefined, undefined)).toBe('Part of a service session')
  })
})

describe('resetRows', () => {
  const requirements = [
    requirement(1, 'Wax', [[11, 'Drip wax', 1]], { distance_used_meters: 196_000, distance_remaining_meters: 4_000, status: 'warning' }),
    requirement(2, 'Clean', [[13, 'Degrease', 1]]),
    requirement(3, 'Hours', [[11, 'Drip wax', 1]], { driving_dimension: 'moving_time', moving_time_used_seconds: 36_000, moving_time_remaining_seconds: 0 }),
    requirement(4, 'Off', [[11, 'Drip wax', 1]], { enabled: false }),
  ]

  it('logging: a satisfier resets ("196 km → 0 · resets"), the rest are not affected; disabled ones are left out', () => {
    const rows = resetRows(requirements, 11, { kind: 'log' })
    expect(rows.map((row) => [row.name, row.resets, row.outcome])).toEqual([
      ['Wax', true, '196 km → 0 · resets'],
      ['Clean', false, 'Not affected'],
      ['Hours', true, '10 hrs → 0 · resets'],
    ])
    expect(rows[0].fraction).toBeCloseTo(0.98)
    expect(rows[0].rule).toMatch(/^Every 200 km/)
  })

  it('with no type chosen nothing resets', () => {
    expect(resetRows(requirements, null, { kind: 'log' }).every((row) => !row.resets)).toBe(true)
  })

  it('editing: "Reset at <km>" for what the service reset', () => {
    const rows = resetRows(requirements, 13, { kind: 'edit', distanceAtServiceMeters: 1_160_000 })
    expect(rows.map((row) => row.outcome)).toEqual(['Not affected', 'Reset at 1,160 km', 'Not affected'])
    expect(resetsTitle(true)).toBe('What this service reset')
    expect(resetsTitle(false)).toBe('What this resets')
  })

  it('is empty without enabled requirements', () => {
    expect(resetRows([], 11, { kind: 'log' })).toEqual([])
  })
})
