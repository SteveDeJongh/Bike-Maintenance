import { describe, expect, it } from 'vitest'
import { formatUsedOfTotal, upNextItems } from './upNext'
import type { DashboardAttentionItem, DashboardRequirementItem } from '../types/models'

const row = (id: number, status: DashboardRequirementItem['status']) =>
  ({ requirement_id: id, status }) as DashboardRequirementItem

describe('upNextItems', () => {
  it('fills up to five rows with ok items after attention', () => {
    const attention = [row(1, 'due'), row(2, 'warning')] as DashboardAttentionItem[]
    const upcoming = [3, 4, 5, 6, 7].map((id) => row(id, 'ok'))
    expect(upNextItems(attention, upcoming).map((item) => item.requirement_id)).toEqual([1, 2, 3, 4, 5])
  })

  it('never cuts attention items, even past the limit', () => {
    const attention = [1, 2, 3, 4, 5, 6].map((id) => row(id, 'due')) as DashboardAttentionItem[]
    expect(upNextItems(attention, [row(7, 'ok')]).map((item) => item.requirement_id)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('shows just the ok rows when nothing is close', () => {
    expect(upNextItems([], [row(1, 'ok'), row(2, 'ok')])).toHaveLength(2)
  })
})

const empty = {
  distance_used_meters: null,
  distance_remaining_meters: null,
  moving_time_used_seconds: null,
  moving_time_remaining_seconds: null,
  days_used: null,
  days_remaining: null,
}

describe('formatUsedOfTotal', () => {
  it('shows distance used of the due span', () => {
    expect(formatUsedOfTotal({ ...empty, driving_dimension: 'distance', distance_used_meters: 192_000, distance_remaining_meters: 8_000 })).toBe(
      '192 / 200 km',
    )
  })

  it('keeps the span when overdue', () => {
    expect(formatUsedOfTotal({ ...empty, driving_dimension: 'distance', distance_used_meters: 320_000, distance_remaining_meters: -120_000 })).toBe(
      '320 / 200 km',
    )
  })

  it('shows moving time in hours', () => {
    expect(
      formatUsedOfTotal({ ...empty, driving_dimension: 'moving_time', moving_time_used_seconds: 11_520, moving_time_remaining_seconds: 6_480 }),
    ).toBe('3.2 / 5 hrs')
  })

  it('shows days', () => {
    expect(formatUsedOfTotal({ ...empty, driving_dimension: 'days', days_used: 40, days_remaining: 20 })).toBe('40 / 60 days')
  })

  it('is empty when the amounts are missing', () => {
    expect(formatUsedOfTotal({ ...empty, driving_dimension: 'distance' })).toBe('')
  })
})
