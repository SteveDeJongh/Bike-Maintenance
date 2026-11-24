import type { BikeListSortColumn } from '../../constants'
import type { BikeWithStats } from '../../types/models'

// The Bikes table's sort value per column. null is "unknown / not
// applicable" (never ridden, no power meter, no type, a retired bike's
// status) and always sorts last, whichever the direction.
export function bikeColumnValue(
  bike: BikeWithStats,
  column: BikeListSortColumn,
  typeNameById: Map<number, string>,
): string | number | null {
  switch (column) {
    case 'name':
      return bike.name
    case 'bike_type':
      return bike.bike_type_id === null ? null : (typeNameById.get(bike.bike_type_id) ?? null)
    case 'status':
      // Most urgent is highest: due outranks any number of warnings.
      return bike.retired_on ? null : bike.status_counts.due * 1000 + bike.status_counts.warning
    case 'acquired_on':
    case 'first_ride_on':
    case 'last_ride_on':
      return bike[column]
    default:
      return bike[column]
  }
}

// Text columns start A-Z; numbers and dates start biggest/newest first.
export function firstDirection(column: BikeListSortColumn): 'asc' | 'desc' {
  return column === 'name' || column === 'bike_type' ? 'asc' : 'desc'
}

// Active bikes first, retired ones after whatever the sort (as the old
// table did), then by the column with nulls last, then by name.
export function sortBikesTable(
  bikes: BikeWithStats[],
  column: BikeListSortColumn,
  direction: 'asc' | 'desc',
  typeNameById: Map<number, string>,
): BikeWithStats[] {
  return [...bikes].sort((a, b) => {
    const retired = Number(Boolean(a.retired_on)) - Number(Boolean(b.retired_on))
    if (retired !== 0) return retired

    const av = bikeColumnValue(a, column, typeNameById)
    const bv = bikeColumnValue(b, column, typeNameById)
    if (av === null || bv === null) {
      if (av !== bv) return av === null ? 1 : -1
      return a.name.localeCompare(b.name)
    }
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number)
    return (direction === 'asc' ? cmp : -cmp) || a.name.localeCompare(b.name)
  })
}
