import { sortByUrgency } from '../../utils/bikeCard'
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

type SortableBike = Pick<BikeWithStats, 'name' | 'last_ride_on' | 'total_distance' | 'status_counts'>

function ridden(bike: SortableBike): number {
  return bike.last_ride_on ? Date.parse(bike.last_ride_on) : -Infinity
}

// The card grid's order. Most urgent is Home's ordering (sortByUrgency) on
// the list's status_counts; Last ridden is newest first (never ridden
// last); Distance is highest first; Name is A-Z. Ties fall back to name.
export function sortBikeCards<T extends SortableBike>(bikes: T[], sort: BikeCardSort): T[] {
  if (sort === 'urgent') return sortByUrgency(bikes, (bike) => bike.status_counts)

  const byName = (a: T, b: T) => a.name.localeCompare(b.name)
  const compare: Record<Exclude<BikeCardSort, 'urgent'>, (a: T, b: T) => number> = {
    last_ridden: (a, b) => (ridden(a) === ridden(b) ? 0 : ridden(b) > ridden(a) ? 1 : -1) || byName(a, b),
    distance: (a, b) => b.total_distance - a.total_distance || byName(a, b),
    name: byName,
  }
  return [...bikes].sort(compare[sort])
}

// A retired row's years ridden: "2019–2024", one year when they match, ''
// when the bike was never ridden.
export function retiredYearRange(bike: Pick<BikeWithStats, 'first_ride_on' | 'last_ride_on'>): string {
  if (!bike.first_ride_on || !bike.last_ride_on) return ''
  const first = new Date(bike.first_ride_on).getFullYear()
  const last = new Date(bike.last_ride_on).getFullYear()
  return first === last ? String(first) : `${first}–${last}`
}

// "Retired Mar 2025" (retired_on is a plain date, read as a local one).
export function retiredLabel(retiredOn: string): string {
  const [year, month] = retiredOn.split('-').map(Number)
  return `Retired ${new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
}

// A bike card's line under its Components rows: the installed components
// the rows don't show. Null when there are none left over.
export function moreComponentsLine(installedCount: number, shownCount: number): string | null {
  const more = installedCount - shownCount
  if (more <= 0) return null
  return `+${more} more ${more === 1 ? 'component' : 'components'}…`
}
