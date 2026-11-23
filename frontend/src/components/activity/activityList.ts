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
