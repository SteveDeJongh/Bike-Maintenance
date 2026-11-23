import { describe, expect, it } from 'vitest'
import {
  activityGridTemplate,
  buildActivityRenderList,
  canAddField,
  effectiveGroupBy,
  phoneMetricLine,
  weekBandTitle,
  weekStartKey,
  weekTotalsLine,
  type ActivityPage,
} from './activityListModel'
import type { ActivityItem, ActivityWeekTotals } from '../../types/models'

describe('effectiveGroupBy', () => {
  it('keeps the saved grouping in date order and turns it off for a field sort', () => {
    expect(effectiveGroupBy('occurred_at', 'week')).toBe('week')
    expect(effectiveGroupBy('occurred_at', 'none')).toBe('none')
    expect(effectiveGroupBy('distance_meters', 'week')).toBe('none')
  })
})

describe('canAddField', () => {
  it('allows up to six fields', () => {
    expect(canAddField(['a', 'b', 'c', 'd', 'e'])).toBe(true)
    expect(canAddField(['a', 'b', 'c', 'd', 'e', 'f'])).toBe(false)
  })
})

describe('activityGridTemplate', () => {
  it('adds one column per field after the fixed three', () => {
    expect(activityGridTemplate(0)).toBe('88px 32px minmax(220px, 1fr)')
    expect(activityGridTemplate(2)).toBe('88px 32px minmax(220px, 1fr) repeat(2, minmax(84px, auto))')
  })
})


const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()
const today = new Date(2026, 10, 22, 9) // Sun, Nov 22, 2026

function session(id: number, occurredAt: string): ActivityItem {
  return { kind: 'service_session', id, occurred_at: occurredAt, bike: null, notes: null, item_count: 0, items: [], summary: '' }
}

const totals = (rides: number): ActivityWeekTotals => ({
  ride_count: rides, distance_meters: rides * 10_000, moving_time: rides * 3_600, total_elevation_gain: rides * 100,
  service_count: 0, setup_count: 0,
})

describe('weekStartKey', () => {
  it('is the local Monday', () => {
    expect(weekStartKey(at(2026, 11, 22))).toBe('2026-11-16') // Sunday
    expect(weekStartKey(at(2026, 11, 16, 0))).toBe('2026-11-16') // Monday midnight
  })
})

describe('weekBandTitle', () => {
  it('names this week and last week', () => {
    expect(weekBandTitle('2026-11-16', today)).toBe('This week · Nov 16 – 22')
    expect(weekBandTitle('2026-11-09', today)).toBe('Last week · Nov 9 – 15')
    expect(weekBandTitle('2026-11-02', today)).toBe('Nov 2 – 8')
  })

  it('spans a month or a year boundary', () => {
    expect(weekBandTitle('2026-10-26', today)).toBe('Oct 26 – Nov 1')
    expect(weekBandTitle('2025-12-29', today)).toBe('Dec 29, 2025 – Jan 4, 2026')
  })

  it('adds the year for a week in another year', () => {
    expect(weekBandTitle('2025-11-17', today)).toBe('Nov 17 – 23, 2025')
  })
})

describe('weekTotalsLine', () => {
  it('shows ride parts when there are rides, and service/setup only above zero', () => {
    expect(weekTotalsLine({ ...totals(2), service_count: 2, setup_count: 0 })).toBe('2 rides · 20 km · 2 hrs · 200 m · 2 service')
    expect(weekTotalsLine({ ...totals(0), ride_count: null, service_count: 1, setup_count: 3 })).toBe('1 service · 3 setup')
    expect(weekTotalsLine(null)).toBe('')
  })
})

describe('buildActivityRenderList', () => {
  const page1: ActivityPage = {
    items: [session(1, at(2026, 11, 18, 18)), session(2, at(2026, 11, 18, 8)), session(3, at(2026, 11, 17))],
    meta: { week_totals: { '2026-11-16': totals(5) } },
  }
  const page2: ActivityPage = {
    items: [session(4, at(2026, 11, 16)), session(5, at(2026, 11, 12))],
    meta: { week_totals: { '2026-11-16': totals(99), '2026-11-09': totals(1) } },
  }

  it('bands each week once, with totals from the first page that has it, and labels each day once', () => {
    const entries = buildActivityRenderList([page1, page2], { groupBy: 'week', phone: false, today })

    const weeks = entries.filter((e) => e.type === 'week')
    expect(weeks.map((w) => w.type === 'week' && w.title)).toEqual(['This week · Nov 16 – 22', 'Last week · Nov 9 – 15'])
    expect(weeks[0].type === 'week' && weeks[0].totals).toBe('5 rides · 50 km · 5 hrs · 500 m')

    const rows = entries.flatMap((e) => (e.type === 'row' ? [[e.item.id, e.showDate]] : []))
    expect(rows).toEqual([[1, true], [2, false], [3, true], [4, true], [5, true]])
  })

  it('has no bands in none mode, and every row shows its date', () => {
    const entries = buildActivityRenderList([page1, page2], { groupBy: 'none', phone: false, today })
    expect(entries.every((e) => e.type === 'row' && e.showDate)).toBe(true)
  })

  it('puts day headers above rows on a phone instead of a date cell', () => {
    const entries = buildActivityRenderList([page1], { groupBy: 'week', phone: true, today })
    expect(entries.map((e) => e.type)).toEqual(['week', 'day', 'row', 'row', 'day', 'row'])
    expect(entries.some((e) => e.type === 'row' && e.showDate)).toBe(false)
  })
})

describe('phoneMetricLine', () => {
  const ride = {
    kind: 'ride', id: 1, occurred_at: at(2026, 11, 20), distance_meters: 48_000, moving_time: 5_760,
    total_elevation_gain: 510.4, average_watts: null,
  } as unknown as ActivityItem

  it('joins the chosen fields in order, skipping unrecorded ones', () => {
    expect(phoneMetricLine(ride, ['distance_meters', 'moving_time', 'average_watts', 'total_elevation_gain'])).toBe('48 km · 1.6 hrs · 510 m')
  })

  it('is empty for non-ride rows', () => {
    expect(phoneMetricLine(session(1, at(2026, 11, 20)), ['distance_meters'])).toBe('')
  })
})
