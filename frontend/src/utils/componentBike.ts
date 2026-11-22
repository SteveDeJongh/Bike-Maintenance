import type { ComponentCurrentBike, ComponentLastBike } from '../types/models'

interface BikeFields {
  current_bikes: ComponentCurrentBike[]
  last_bike: ComponentLastBike | null
}

export type BikeColumnState = 'mounted' | 'last_on' | 'never'

// Which of the Bike column's three readings applies: on a bike now, "Last
// on X" (removed or retired), or never installed.
export function bikeColumnState(component: BikeFields): BikeColumnState {
  if (component.current_bikes.length > 0) return 'mounted'
  return component.last_bike ? 'last_on' : 'never'
}

// Sort key for the Components list's Bike column: mounted bikes first by
// name, then "last on" bikes by name, then never installed (null, which
// the list's comparator always sorts last).
export function bikeColumnSortKey(component: BikeFields): string | null {
  switch (bikeColumnState(component)) {
    case 'mounted':
      return `0 ${component.current_bikes[0].name}`
    case 'last_on':
      return `1 ${component.last_bike!.name}`
    default:
      return null
  }
}
