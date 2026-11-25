import { describe, expect, it } from 'vitest'
import {
  buildMaintenanceRenderList,
  defaultSessionBike,
  eventAccessibleName,
  sessionAccessibleName,
  effectiveGroupBy,
  maintenanceTiles,
  readMaintenanceView,
  servicesThisYearLine,
  viewBadgeCount,
} from './maintenanceLogModel'
import { DEFAULT_MAINTENANCE_FIELDS } from './maintenanceLogFields'
import type { MaintenanceLogEvent } from '../../types/models'

describe('readMaintenanceView', () => {
  it('gives the defaults for an empty preference', () => {
    expect(readMaintenanceView({})).toEqual({
      fields: DEFAULT_MAINTENANCE_FIELDS,
      kinds: ['session', 'single'],
      groupBy: 'month',
      bikeId: undefined,
      category: undefined,
      serviceTypeId: undefined,
      datePreset: 'this_year',
      customRange: [null, null],
    })
  })

  it("drops the old table's columns and caps Fields at five", () => {
    expect(readMaintenanceView({ columns: ['performed_at', 'service_type', 'notes'] }).fields).toEqual(DEFAULT_MAINTENANCE_FIELDS)
    const all = ['component', 'bike', 'component_km', 'since_last', 'category', 'bike_km', 'logged_on']
    expect(readMaintenanceView({ columns: all }).fields).toHaveLength(5)
    expect(readMaintenanceView({ columns: ['bike_km', 'nope'] }).fields).toEqual(['bike_km'])
  })

  it('reads saved choices and rejects bad ones', () => {
    const view = readMaintenanceView({
      kinds: ['single', 'ride'],
      group_by: 'component',
      bike_id: 4,
      category: 'chain',
      service_type_id: 9,
      date_preset: 'custom',
      date_range: ['2026-02-01', 'garbage'],
    })
    expect(view).toMatchObject({ kinds: ['single'], groupBy: 'component', bikeId: 4, category: 'chain', serviceTypeId: 9 })
    expect(view.datePreset).toBe('custom')
    expect(view.customRange).toEqual(['2026-02-01', null])
    expect(readMaintenanceView({ group_by: 'week', date_preset: 'all' })).toMatchObject({ groupBy: 'month', datePreset: null })
  })
})

describe('effectiveGroupBy', () => {
  it('keeps the saved grouping for date order and flattens for a field sort', () => {
    expect(effectiveGroupBy('performed_at', 'component')).toBe('component')
    expect(effectiveGroupBy('since_last', 'month')).toBe('flat')
  })
})

describe('viewBadgeCount', () => {
  const defaults = { kinds: ['session', 'single'] as const, groupBy: 'month' as const, fields: DEFAULT_MAINTENANCE_FIELDS, sort: 'performed_at' as const, order: 'desc' as const }

  it('counts each non-default choice once', () => {
    expect(viewBadgeCount({ ...defaults, kinds: [...defaults.kinds] })).toBe(0)
    expect(
      viewBadgeCount({ kinds: ['single'], groupBy: 'none', fields: ['component'], sort: 'component_km', order: 'desc' }),
    ).toBe(4)
    expect(viewBadgeCount({ ...defaults, kinds: [...defaults.kinds], order: 'asc' })).toBe(1)
  })
})

describe('defaultSessionBike', () => {
  const bike = (id: number, name: string, last: string | null, retired: string | null = null) => ({
    id,
    name,
    last_ride_on: last,
    retired_on: retired,
  })

  it('picks the active bike ridden most recently, else the first by name', () => {
    const bikes = [bike(1, 'Road', '2026-11-01'), bike(2, 'Gravel', '2026-11-20'), bike(3, 'Old', '2026-11-24', '2026-11-24')]
    expect(defaultSessionBike(bikes)?.id).toBe(2)
    expect(defaultSessionBike([bike(1, 'Zed', null), bike(2, 'Alpha', null)])?.id).toBe(2)
    expect(defaultSessionBike([bike(3, 'Old', null, '2026-01-01')])).toBeUndefined()
    expect(defaultSessionBike(undefined)).toBeUndefined()
  })
})

describe('maintenanceTiles', () => {
  const now = new Date(2026, 10, 25)
  const tiles = {
    services_this_year: 86,
    sessions_this_year: 12,
    last_service_at: '2026-11-21T10:00:00Z',
    most_serviced: { component_id: 1, label: 'Chain S1', count: 14 },
  }

  it('builds the five tiles, Due · soon orange when non-zero', () => {
    const result = maintenanceTiles(tiles, { due: 1, soon: 2 }, now)
    expect(result.map((tile) => [tile.label, tile.value])).toEqual([
      ['Services this year', '86'],
      ['Sessions', '12'],
      ['Last service', expect.stringMatching(/Nov 2[01]/)],
      ['Due · soon', '1 · 2'],
      ['Most serviced', 'Chain S1 · 14'],
    ])
    expect(result[3].color).toBe('orange')
    expect(maintenanceTiles(tiles, { due: 0, soon: 0 }, now)[3].color).toBeUndefined()
  })

  it('shows dashes before data or with nothing logged', () => {
    expect(maintenanceTiles(undefined, undefined).every((tile) => tile.value === '—')).toBe(true)
    const empty = maintenanceTiles({ ...tiles, last_service_at: null, most_serviced: null }, { due: 0, soon: 0 }, now)
    expect(empty.map((tile) => tile.value)).toEqual(['86', '12', '—', '0 · 0', '—'])
  })
})

describe('servicesThisYearLine', () => {
  it('reads "86 services this year", singular at 1', () => {
    expect(servicesThisYearLine(86)).toBe('86 services this year')
    expect(servicesThisYearLine(1)).toBe('1 service this year')
    expect(servicesThisYearLine(undefined)).toBe('')
  })
})

describe('buildMaintenanceRenderList', () => {
  const ev = (id: number, at: string, overrides: Partial<MaintenanceLogEvent> = {}): MaintenanceLogEvent => ({
    id,
    component_id: 1,
    service_type_id: 1,
    performed_at: at,
    notes: null,
    service_session_id: null,
    created_at: at,
    service_type: { id: 1, name: 'Drip wax' },
    component: { id: 1, label: 'Chain S1', category: 'chain' },
    bike: null,
    component_distance_at_event_meters: 0,
    since_last_same_type_meters: null,
    bike_distance_at_event_meters: null,
    resets: [],
    ...overrides,
  })
  const session = { id: 7, performed_at: '2026-11-14T09:00:00', bike: { id: 2, name: 'Libre' }, notes: null, event_count: 3, matching_count: 3 }
  const inSession = (id: number) => ev(id, '2026-11-14T09:00:00', { service_session_id: 7 })
  const meta = {
    month_totals: { '2026-11': { services: 18, sessions: 5, components: 9 }, '2026-10': { services: 1, sessions: 0, components: 1 } },
    component_totals: { '1': 14, '2': 1 },
  }
  const shape = (entries: ReturnType<typeof buildMaintenanceRenderList>) =>
    entries.map((e) => (e.type === 'event' ? `event ${e.event.id}${e.showDate ? ' date' : ''}${e.inSession ? ' in' : ''}${e.sessionLink ? ' link' : ''}` : e.type === 'session' ? `session ${e.countLabel}${e.showDate ? ' date' : ''}` : `${e.type} ${e.title}${'totals' in e ? ` (${e.totals})` : ''}`))

  it('groups by month with session headers and their events, one header across a Load more boundary', () => {
    const pages = [
      { events: [ev(1, '2026-11-20T10:00:00'), ev(2, '2026-11-20T08:00:00'), inSession(3)], sessions: { '7': session }, meta },
      { events: [inSession(4), inSession(5), ev(6, '2026-10-02T10:00:00')], sessions: { '7': session }, meta },
    ]
    expect(shape(buildMaintenanceRenderList(pages, 'month'))).toEqual([
      'month November 2026 (18 services · 5 sessions · 9 components)',
      'event 1 date',
      'event 2',
      'session 3 services date',
      'event 3 in',
      'event 4 in',
      'event 5 in',
      'month October 2026 (1 service · 1 component)',
      'event 6 date',
    ])
  })

  it('reads "2 of 3 services" when the filters hide some of a session', () => {
    const pages = [{ events: [inSession(3), inSession(4)], sessions: { '7': { ...session, matching_count: 2 } }, meta }]
    expect(shape(buildMaintenanceRenderList(pages, 'none'))).toEqual(['session 2 of 3 services date', 'event 3 in', 'event 4 in'])
  })

  it('shows every date with no bands for None', () => {
    const pages = [{ events: [ev(1, '2026-11-20T10:00:00'), ev(2, '2026-11-20T08:00:00')], sessions: {}, meta }]
    expect(shape(buildMaintenanceRenderList(pages, 'none'))).toEqual(['event 1 date', 'event 2 date'])
  })

  it('bands by component without session headers, marking session events', () => {
    const cassette = { component: { id: 2, label: 'Cassette', category: 'cassette' } }
    const pages = [{ events: [ev(9, '2026-11-01T10:00:00', cassette), inSession(3), ev(1, '2026-10-01T10:00:00')], sessions: { '7': session }, meta }]
    expect(shape(buildMaintenanceRenderList(pages, 'component'))).toEqual([
      'component Cassette · 1 service',
      'event 9 date',
      'component Chain S1 · 14 services',
      'event 3 date link',
      'event 1 date',
    ])
  })

  it('flattens for a field sort: no bands, no headers', () => {
    const pages = [{ events: [inSession(3), ev(1, '2026-10-01T10:00:00')], sessions: { '7': session }, meta }]
    expect(shape(buildMaintenanceRenderList(pages, 'flat'))).toEqual(['event 3 date link', 'event 1 date'])
  })
})

describe('accessible names', () => {
  it('names an event and a session', () => {
    const event = {
      service_type: { id: 1, name: 'Drip wax' },
      component: { id: 1, label: 'Chain S1', category: 'chain' },
      performed_at: '2026-11-14T09:00:00',
    } as MaintenanceLogEvent
    expect(eventAccessibleName(event)).toBe('Drip wax, Chain S1, Nov 14, open')
    const session = { id: 7, performed_at: '2026-11-14T09:00:00', bike: { id: 2, name: 'Libre' }, notes: null, event_count: 3, matching_count: 3 }
    expect(sessionAccessibleName(session, '3 services')).toBe('Service session, Libre, 3 services, Nov 14, open')
  })
})
