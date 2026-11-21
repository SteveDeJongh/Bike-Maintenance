import type { DashboardAttentionItem, DashboardRequirementItem } from '../types/models'

// Every attention item (due and warning, never cut off), then ok rows
// until `limit` rows in total.
export function upNextItems(
  attention: DashboardAttentionItem[],
  upcoming: DashboardRequirementItem[],
  limit = 5,
): DashboardRequirementItem[] {
  return [...attention, ...upcoming.slice(0, Math.max(0, limit - attention.length))]
}

function plainNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

// "192 / 200 km", "3.2 / 5 hrs", "40 / 60 days" on the driving dimension.
// The total is used + remaining -- the actual due span, which a satisfier's
// own allowance can make differ from the requirement's nominal interval.
export function formatUsedOfTotal(
  item: Pick<
    DashboardRequirementItem,
    | 'driving_dimension'
    | 'distance_used_meters'
    | 'distance_remaining_meters'
    | 'moving_time_used_seconds'
    | 'moving_time_remaining_seconds'
    | 'days_used'
    | 'days_remaining'
  >,
): string {
  const pair = (used: number | null, remaining: number | null) =>
    used == null || remaining == null ? null : ([used, used + remaining] as const)

  switch (item.driving_dimension) {
    case 'distance': {
      const values = pair(item.distance_used_meters, item.distance_remaining_meters)
      return values ? `${plainNumber(values[0] / 1000)} / ${plainNumber(values[1] / 1000)} km` : ''
    }
    case 'moving_time': {
      const values = pair(item.moving_time_used_seconds, item.moving_time_remaining_seconds)
      return values ? `${plainNumber(values[0] / 3600)} / ${plainNumber(values[1] / 3600)} hrs` : ''
    }
    default: {
      const values = pair(item.days_used, item.days_remaining)
      return values ? `${values[0]} / ${values[1]} days` : ''
    }
  }
}
