import { describe, expect, it } from 'vitest'
import {
  componentPickerGroups,
  defaultServiceTypeId,
  pickerLine,
  riddenDetail,
  serviceTypeAfterComponentChange,
  statusChip,
  lastRideEnd,
  lastRideLine,
  MAX_RECENT_PILLS,
  primaryAction,
  resetRows,
  resetsTitle,
  servicePills,
  sessionLockText,
} from './logServiceModel'
import { CREATE_NEW_SERVICE_TYPE } from '../ServiceTypePicker'
import type { ComponentListItem, ComponentMaintenanceEvent, ComponentServiceRequirementWithStatus, ServiceStatus } from '../../types/models'

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

describe('the component picker', () => {
  // Juan Solo ridden more recently than the Soloist, so it comes first.
  const juan = { id: 1, name: 'Juan Solo', retired_on: null, last_ride_on: '2026-11-24T18:00:00Z' }
  const soloist = { id: 2, name: 'Soloist', retired_on: null, last_ride_on: '2026-11-16T09:00:00Z' }
  const oldBike = { id: 3, name: 'Old MTB', retired_on: '2025-01-01', last_ride_on: '2024-12-01T00:00:00Z' }
  const on = (bike: { id: number; name: string }, ride_context: 'both' | 'indoor_only' = 'both') => ({ id: bike.id, name: bike.name, ride_context })
  let nextId = 1
  const part = (overrides: Partial<ComponentListItem>): ComponentListItem =>
    ({
      id: nextId++,
      label: 'Part',
      category: 'chain',
      acquired_on: '2026-01-01',
      retired_on: null,
      brand: null,
      model: null,
      notes: null,
      service_status: 'ok',
      worst_requirement_name: 'Wax',
      current_bikes: [],
      last_bike: null,
      fraction_used: 0.2,
      driving_dimension: 'distance',
      distance_remaining_meters: null,
      moving_time_remaining_seconds: null,
      days_remaining: null,
      has_enabled_requirement: true,
      lifetime_distance_meters: 1_356_000,
      assigned_since: null,
      rotates: false,
      latest_service: null,
      ...overrides,
    }) as ComponentListItem

  const chainS1 = part({ label: 'Chain S1', current_bikes: [on(soloist)], service_status: 'due', fraction_used: 1.1 })
  const cassette = part({ label: 'Shared cassette', category: 'cassette', current_bikes: [on(juan, 'indoor_only'), on(soloist, 'indoor_only')] })
  const tire = part({ label: 'Front tire', category: 'tire_front', current_bikes: [on(juan)], service_status: 'warning', worst_requirement_name: 'Check', fraction_used: 0.9 })
  const chainJ = part({ label: 'Chain J1', current_bikes: [on(juan)] })
  const spare = part({
    label: 'Chain S2',
    rotates: true,
    last_bike: { id: 2, name: 'Soloist', removed_at: '2026-10-01T00:00:00Z' },
    latest_service: { service_type_name: 'drip wax', performed_at: '2026-10-05T00:00:00Z' },
  })
  const retired = part({ label: 'Old chain', retired_on: '2026-01-01', service_status: 'due' })
  const all = [chainS1, cassette, tire, chainJ, spare, retired]
  const order = ['chain', 'cassette', 'tire_front']
  const shape = (groups: ReturnType<typeof componentPickerGroups>) =>
    groups.map((group) => [group.label, group.options.map((o) => `${o.component.label}${o.chip ? ` [${o.chip.label}]` : ''}`)])

  it('groups Needs attention, then each active bike by last ride in category order, then spares; retired hidden', () => {
    expect(shape(componentPickerGroups(all, { bikes: [soloist, juan, oldBike], categoryOrder: order }))).toEqual([
      ['Needs attention', ['Chain S1 [Wax due]', 'Front tire [Check soon]']],
      ['Juan Solo', ['Chain J1', 'Shared cassette', 'Front tire [Check soon]']],
      ['Soloist', ['Chain S1 [Wax due]', 'Shared cassette']],
      ['Spares', ['Chain S2 [Drip wax · ready]']],
    ])
  })

  it('shows retired at the end when asked, and search narrows every group', () => {
    const groups = componentPickerGroups(all, { bikes: [soloist, juan], categoryOrder: order, showRetired: true })
    expect(groups.at(-1)?.label).toBe('Retired')
    expect(groups.at(-1)?.options.map((o) => [o.component.label, o.chip])).toEqual([['Old chain', null]])
    expect(shape(componentPickerGroups(all, { bikes: [soloist, juan], categoryOrder: order, q: 'chain s' }))).toEqual([
      ['Needs attention', ['Chain S1 [Wax due]']],
      ['Soloist', ['Chain S1 [Wax due]']],
      ['Spares', ['Chain S2 [Drip wax · ready]']],
    ])
  })

  it('orders bikes most recently ridden first, never ridden last, ties by name; spares and retired after every bike', () => {
    const fresh = { id: 4, name: 'Zed', retired_on: null, last_ride_on: '2026-11-26T08:00:00Z' }
    const tieA = { id: 5, name: 'Alpha', retired_on: null, last_ride_on: '2026-11-20T10:00:00Z' }
    const tieB = { id: 6, name: 'Beta', retired_on: null, last_ride_on: '2026-11-20T10:00:00Z' }
    const never = { id: 7, name: 'Aardvark', retired_on: null, last_ride_on: null }
    const bikes = [never, tieB, soloist, tieA, fresh, juan]
    const mountedOn = (bike: { id: number; name: string }) => part({ label: `On ${bike.name}`, current_bikes: [on(bike)] })
    const components = [...bikes.map(mountedOn), spare, retired]
    const groups = componentPickerGroups(components, { bikes, categoryOrder: order, showRetired: true })
    expect(groups.map((group) => group.label)).toEqual(['Zed', 'Juan Solo', 'Alpha', 'Beta', 'Soloist', 'Aardvark', 'Spares', 'Retired'])
  })

  it('gives each bike group a dimmed "ridden …" detail, and nothing for a never-ridden bike or the other groups', () => {
    const now = new Date('2026-11-26T12:00:00')
    expect(riddenDetail(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8).toISOString(), now)).toBe('ridden today')
    expect(riddenDetail(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 20).toISOString(), now)).toBe('ridden yesterday')
    expect(riddenDetail(new Date(2026, 10, 16, 9).toISOString(), now)).toBe('ridden Nov 16')
    expect(riddenDetail(null, now)).toBeNull()
    const groups = componentPickerGroups(all, { bikes: [soloist, juan], categoryOrder: order, now })
    expect(groups.map((group) => [group.label, group.detail])).toEqual([
      ['Needs attention', null],
      ['Juan Solo', 'ridden Nov 24'],
      ['Soloist', 'ridden Nov 16'],
      ['Spares', null],
    ])
  })

  it('reads the line and chip', () => {
    expect(pickerLine(chainJ)).toBe('Chain · on Juan Solo · 1,356 km lifetime')
    expect(pickerLine(spare)).toMatch(/^Chain · last on Soloist · /)
    expect(statusChip({ service_status: 'due', worst_requirement_name: 'Wax' })).toEqual({ label: 'Wax due', color: 'red' })
    expect(statusChip({ service_status: 'warning', worst_requirement_name: 'Clean' })).toEqual({ label: 'Clean soon', color: 'orange' })
    expect(statusChip({ service_status: 'ok', worst_requirement_name: 'Wax' })).toBeNull()
  })
})

describe('serviceTypeAfterComponentChange', () => {
  const pills = [{ serviceTypeId: 11, name: 'Drip wax', requirementNames: ['Wax'] }]
  const serviceTypes = [
    { id: 11, categories: ['chain'] },
    { id: 20, categories: [] }, // universal
    { id: 30, categories: ['tire_front'] },
  ]
  const next = { pills, category: 'chain', serviceTypes, defaultId: 11 }

  it('keeps a pill, a universal or a category-tagged type; otherwise takes the new default', () => {
    expect(serviceTypeAfterComponentChange('11', next)).toBe('11')
    expect(serviceTypeAfterComponentChange('20', next)).toBe('20')
    expect(serviceTypeAfterComponentChange('30', next)).toBe('11')
    expect(serviceTypeAfterComponentChange('30', { ...next, defaultId: undefined })).toBe('')
    expect(serviceTypeAfterComponentChange('', next)).toBe('11')
    expect(serviceTypeAfterComponentChange(CREATE_NEW_SERVICE_TYPE, next)).toBe(CREATE_NEW_SERVICE_TYPE)
  })
})
