import type { BikeWithStats } from '../../types/models'

export const BIKES_VIEWS = ['cards', 'table'] as const
export type BikesView = (typeof BIKES_VIEWS)[number]

export const BIKE_CARD_SORTS = ['urgent', 'last_ridden', 'distance', 'name'] as const
export type BikeCardSort = (typeof BIKE_CARD_SORTS)[number]

export const BIKE_CARD_SORT_LABELS: Record<BikeCardSort, string> = {
  urgent: 'Most urgent',
  last_ridden: 'Last ridden',
  distance: 'Distance',
  name: 'Name',
}

export function isBikesView(value: unknown): value is BikesView {
  return typeof value === 'string' && (BIKES_VIEWS as readonly string[]).includes(value)
}

export function isBikeCardSort(value: unknown): value is BikeCardSort {
  return typeof value === 'string' && (BIKE_CARD_SORTS as readonly string[]).includes(value)
}

export interface BikeTileTotals {
  active: number
  retired: number
  totalDistance: number
  thisYear: number
  components: number
  due: number
  warning: number
}

// The Bikes page's tiles and header line. Everything but `retired` sums
// over active bikes only.
export function bikeTileTotals(
  bikes: Pick<BikeWithStats, 'retired_on' | 'total_distance' | 'distance_this_year' | 'installed_components_count' | 'status_counts'>[],
): BikeTileTotals {
  const active = bikes.filter((bike) => !bike.retired_on)
  const sum = (pick: (bike: (typeof active)[number]) => number) => active.reduce((total, bike) => total + pick(bike), 0)

  return {
    active: active.length,
    retired: bikes.length - active.length,
    totalDistance: sum((bike) => bike.total_distance),
    thisYear: sum((bike) => bike.distance_this_year),
    components: sum((bike) => bike.installed_components_count),
    due: sum((bike) => bike.status_counts.due),
    warning: sum((bike) => bike.status_counts.warning),
  }
}

// "3 active · 1 retired" (the retired part only when there are any).
export function bikesHeaderLine({ active, retired }: Pick<BikeTileTotals, 'active' | 'retired'>): string {
  return retired > 0 ? `${active} active · ${retired} retired` : `${active} active`
}
