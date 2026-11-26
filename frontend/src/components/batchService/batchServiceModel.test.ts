import { describe, expect, it } from 'vitest'
import {
  batchFooterCounts,
  bikeSwitchConfirm,
  dueAndSoonCount,
  dueAndSoonKeys,
  readyLine,
  rowsForComponent,
  rowStatus,
} from './batchServiceModel'
import type { ComponentListItem, ServiceableComponent, ServiceableComponentRequirement, ServiceStatus } from '../../types/models'

function requirement(
  id: number,
  status: ServiceStatus,
  satisfiers: [number, string, number][],
  overrides: Partial<ServiceableComponentRequirement> = {},
): ServiceableComponentRequirement {
  return {
    id,
    requirement_name: `Req ${id}`,
    satisfiers: satisfiers.map(([typeId, name, position]) => ({
      id: typeId * 10 + id,
      service_type_id: typeId,
      service_type_name: name,
      position,
      allowance_distance_meters: null,
      allowance_moving_time_seconds: null,
      allowance_calendar_amount: null,
      allowance_calendar_unit: null,
    })),
    status,
    driving_dimension: 'distance',
    distance_remaining_meters: 40_000,
    moving_time_remaining_seconds: null,
    days_remaining: null,
    setting_event: null,
    ...overrides,
  }
}

const chain: ServiceableComponent = {
  id: 1,
  label: 'Chain S1',
  category: 'chain',
  service_requirements: [
    requirement(1, 'ok', [[11, 'Drip wax', 1]]),
    requirement(2, 'due', [[11, 'Drip wax', 2], [12, 'Hot wax', 1]], { distance_remaining_meters: -8_000 }),
  ],
}
const cassette: ServiceableComponent = {
  id: 2,
  label: 'Cassette',
  category: 'cassette',
  service_requirements: [requirement(3, 'warning', [[13, 'Clean', 1]], { driving_dimension: 'days', days_remaining: 6 })],
}

describe('rowsForComponent', () => {
  it('gives one row per type, showing the worst requirement it clears', () => {
    const rows = rowsForComponent(chain)
    expect(rows.map((row) => [row.serviceTypeName, row.requirements.length, row.worst.status])).toEqual([
      ['Drip wax', 2, 'due'],
      ['Hot wax', 1, 'due'],
    ])
    expect(rowStatus(rows[0])).toEqual({ chip: { label: 'Due', color: 'red' }, metric: '8 km over', metricColor: 'red' })
    expect(rowStatus(rowsForComponent(cassette)[0])).toMatchObject({ chip: { label: 'Soon' }, metric: '6 days left', metricColor: 'orange' })
    const ok = rowsForComponent({ ...chain, service_requirements: [requirement(1, 'ok', [[11, 'Drip wax', 1]])] })[0]
    expect(rowStatus(ok)).toEqual({ chip: { label: 'OK', color: 'teal' }, metric: '40 km left', metricColor: 'dimmed' })
  })
})

describe('Select all due and soon', () => {
  it("adds each non-OK requirement's first satisfier, counting only what it would add", () => {
    expect(dueAndSoonKeys([chain, cassette])).toEqual(['1:12', '2:13'])
    expect(dueAndSoonCount([chain, cassette], new Set())).toBe(2)
    expect(dueAndSoonCount([chain, cassette], new Set(['1:12']))).toBe(1)
    expect(dueAndSoonCount([chain, cassette], new Set(['1:12', '2:13']))).toBe(0)
  })
})

describe('batchFooterCounts', () => {
  it('reads "4 selected · 3 components", Other service rows included', () => {
    expect(batchFooterCounts(new Set(['1:11', '1:12', '2:13']), [5])).toEqual({ count: 4, text: '4 selected · 3 components' })
    expect(batchFooterCounts(new Set(['1:11']), [1]).text).toBe('2 selected · 1 component')
    expect(batchFooterCounts(new Set(), [])).toEqual({ count: 0, text: 'Nothing selected' })
  })
})

describe('bikeSwitchConfirm', () => {
  it('asks only when selections would be cleared', () => {
    expect(bikeSwitchConfirm(0)).toBeNull()
    expect(bikeSwitchConfirm(1)).toBe('Clear 1 selection?')
    expect(bikeSwitchConfirm(3)).toBe('Clear 3 selections?')
  })
})

describe('readyLine', () => {
  const spare = {
    retired_on: null,
    current_bikes: [],
    rotates: true,
    service_status: 'ok',
    last_bike: { id: 2, name: 'Soloist', removed_at: '2026-11-01T00:00:00Z' },
    latest_service: { service_type_name: 'Drip wax', performed_at: '2026-11-20T10:00:00Z' },
  } as unknown as ComponentListItem
  const now = new Date(2026, 10, 25)

  it('reads "drip wax Nov 20" for a ready rotating spare, else nothing', () => {
    expect(readyLine(spare, now)).toMatch(/^drip wax Nov 2[01]$/)
    expect(readyLine({ ...spare, rotates: false }, now)).toBeNull()
    expect(readyLine({ ...spare, latest_service: { service_type_name: 'Drip wax', performed_at: '2026-10-01T00:00:00Z' } }, now)).toBeNull()
    expect(readyLine(undefined, now)).toBeNull()
  })
})
