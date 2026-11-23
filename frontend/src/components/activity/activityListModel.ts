import { MAX_ACTIVITY_FIELDS } from './activityFields'
import { formatDistance } from '../../utils/distance'
import { formatDuration } from '../../utils/duration'
import { formatElevation } from '../../utils/elevation'
import type { ActivityItem, ActivityWeekTotals } from '../../types/models'

export type GroupBy = 'week' | 'none'
export type ActivitySortColumn = 'occurred_at' | string

// Sorting by a field lists rides by that metric, so week/day grouping no
// longer means anything -- it's off while a field sort is active, without
// touching the saved choice, which comes back with date order.
export function effectiveGroupBy(sortColumn: ActivitySortColumn, saved: GroupBy): GroupBy {
  return sortColumn === 'occurred_at' ? saved : 'none'
}

// Whether another field can be shown (the Fields picker's cap).
export function canAddField(visible: readonly string[], cap: number = MAX_ACTIVITY_FIELDS): boolean {
  return visible.length < cap
}

// The one grid template the column header and every row share, so their
// columns line up: Date | icon | Activity | one per shown field.
export function activityGridTemplate(fieldCount: number): string {
  const fields = fieldCount > 0 ? ` repeat(${fieldCount}, minmax(84px, auto))` : ''
  return `88px 32px minmax(220px, 1fr)${fields}`
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// The narrowest the grid can get before the list scrolls sideways: the
// fixed columns' minimums, each field's, the gaps and the row padding.
export function activityListMinWidth(fieldCount: number): number {
  return 88 + 32 + 220 + fieldCount * 84 + (2 + fieldCount) * 12 + 24
}

// The Date column's two lines: "Today" or a weekday, over "Nov 20".
export function dayLabel(value: string, today: Date = new Date()): { primary: string; secondary: string } {
  const date = new Date(value)
  return {
    primary: sameLocalDay(date, today) ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' }),
    secondary: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

// "8:12 am"
export function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase()
}

const pad = (n: number) => String(n).padStart(2, '0')

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseIsoDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function mondayOf(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday
}

// The local Monday (YYYY-MM-DD) of the week an instant falls in -- the
// same key the feed's meta.week_totals uses (the page sends the browser's
// own zone as tz).
export function weekStartKey(value: string): string {
  return isoDate(mondayOf(new Date(value)))
}

function localDayKey(value: string): string {
  return isoDate(new Date(value))
}

// "This week · Nov 16 – 22", "Last week · Nov 9 – 15", "Nov 2 – 8",
// "Oct 26 – Nov 1", "Dec 28, 2025 – Jan 3, 2026"; a week in another year
// than today's ends with its year ("Nov 16 – 22, 2025").
export function weekBandTitle(weekStart: string, today: Date = new Date()): string {
  const start = parseIsoDate(weekStart)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const month = (date: Date) => date.toLocaleDateString('en-US', { month: 'short' })

  let range: string
  if (start.getFullYear() !== end.getFullYear()) {
    range = `${month(start)} ${start.getDate()}, ${start.getFullYear()} – ${month(end)} ${end.getDate()}, ${end.getFullYear()}`
  } else {
    range =
      start.getMonth() === end.getMonth()
        ? `${month(start)} ${start.getDate()} – ${end.getDate()}`
        : `${month(start)} ${start.getDate()} – ${month(end)} ${end.getDate()}`
    if (start.getFullYear() !== today.getFullYear()) range += `, ${start.getFullYear()}`
  }

  const thisMonday = mondayOf(today)
  const weeksAgo = Math.round((thisMonday.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000))
  if (weeksAgo === 0) return `This week · ${range}`
  if (weeksAgo === 1) return `Last week · ${range}`
  return range
}

// "5 rides · 214 km · 7.8 hrs · 2,270 m · 2 service · 1 setup" -- ride
// parts only when the week has rides, service and setup only when > 0.
export function weekTotalsLine(totals: ActivityWeekTotals | null): string {
  if (!totals) return ''
  const parts: string[] = []
  if (totals.ride_count) {
    parts.push(`${totals.ride_count} ${totals.ride_count === 1 ? 'ride' : 'rides'}`)
    parts.push(formatDistance(totals.distance_meters ?? 0))
    parts.push(formatDuration(totals.moving_time ?? 0))
    parts.push(formatElevation(totals.total_elevation_gain ?? 0))
  }
  if (totals.service_count) parts.push(`${totals.service_count} service`)
  if (totals.setup_count) parts.push(`${totals.setup_count} setup`)
  return parts.join(' · ')
}

export interface ActivityPage {
  items: ActivityItem[]
  meta: { week_totals?: Record<string, ActivityWeekTotals> } | null
}

export type ActivityRenderEntry =
  | { type: 'week'; key: string; title: string; totals: string }
  | { type: 'day'; key: string; value: string }
  | { type: 'row'; key: string; item: ActivityItem; showDate: boolean }

// The flat list ActivityList renders, from the loaded pages in order.
// - week: a band at each new local week (one band even when the week runs
//   across a "Load more" boundary), its totals from the first page whose
//   week_totals has it; the day label shows on each day's first row only.
// - none: no bands, and every row shows its own day.
// - phone: day labels become their own 'day' entries above their rows
//   (rows never show a date cell), in either mode.
export function buildActivityRenderList(
  pages: ActivityPage[],
  { groupBy, phone, today = new Date() }: { groupBy: GroupBy; phone: boolean; today?: Date },
): ActivityRenderEntry[] {
  const weekTotals = new Map<string, ActivityWeekTotals>()
  for (const page of pages) {
    for (const [key, totals] of Object.entries(page.meta?.week_totals ?? {})) {
      if (!weekTotals.has(key)) weekTotals.set(key, totals)
    }
  }

  const entries: ActivityRenderEntry[] = []
  let lastWeek: string | null = null
  let lastDay: string | null = null

  pages.flatMap((page) => page.items).forEach((item, index) => {
    const week = weekStartKey(item.occurred_at)
    const day = localDayKey(item.occurred_at)

    if (groupBy === 'week' && week !== lastWeek) {
      entries.push({ type: 'week', key: `week-${week}`, title: weekBandTitle(week, today), totals: weekTotalsLine(weekTotals.get(week) ?? null) })
      lastWeek = week
      lastDay = null
    }

    const firstOfDay = day !== lastDay
    if (phone && firstOfDay) entries.push({ type: 'day', key: `day-${day}-${index}`, value: item.occurred_at })
    entries.push({
      type: 'row',
      key: `${item.kind}-${item.id}-${index}`,
      item,
      showDate: !phone && (groupBy === 'none' || firstOfDay),
    })
    lastDay = day
  })

  return entries
}
