import { MAX_ACTIVITY_FIELDS } from './activityFields'

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
