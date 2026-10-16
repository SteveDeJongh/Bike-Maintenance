export const COMPONENT_CATEGORIES = [
  'chain',
  'cassette',
  'chainring',
  'tire_front',
  'tire_rear',
  'wheel_front',
  'wheel_rear',
  'brake_pads_front',
  'brake_pads_rear',
  'bottom_bracket',
  'handlebar_tape',
  'saddle',
] as const

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number]

export const COMPONENT_CATEGORY_LABELS: Record<ComponentCategory, string> = {
  chain: 'Chain',
  cassette: 'Cassette',
  chainring: 'Chainring',
  tire_front: 'Front Tire',
  tire_rear: 'Rear Tire',
  wheel_front: 'Front Wheel',
  wheel_rear: 'Rear Wheel',
  brake_pads_front: 'Front Brake Pads',
  brake_pads_rear: 'Rear Brake Pads',
  bottom_bracket: 'Bottom Bracket',
  handlebar_tape: 'Handlebar Tape',
  saddle: 'Saddle',
}

export function categoryLabel(category: string): string {
  return COMPONENT_CATEGORY_LABELS[category as ComponentCategory] ?? category
}

// Must match MaintenanceEvent::EVENT_TYPES in api/app/models/maintenance_event.rb exactly.
export const MAINTENANCE_EVENT_TYPES = ['wax', 'clean', 'replace', 'inspect'] as const

// The toggleable columns on the Bikes list. Canonical order (used both for display
// order and the fixed order columns appear in regardless of toggle order). Name is
// always shown (the link column) and isn't part of this list, but is still sortable
// — see BIKE_LIST_SORT_COLUMNS. Not enforced server-side: User#bike_list_preferences
// stores whatever keys it's given, so this list is the sole source of truth.
export const BIKE_LIST_COLUMNS = [
  'make_model',
  'total_distance',
  'total_moving_time',
  'first_ride_on',
  'last_ride_on',
  'average_power',
  'total_elevation_gain',
  'installed_components_count',
] as const

export type BikeListColumn = (typeof BIKE_LIST_COLUMNS)[number]

export const BIKE_LIST_COLUMN_LABELS: Record<BikeListColumn, string> = {
  make_model: 'Make / Model',
  total_distance: 'Distance',
  total_moving_time: 'Time',
  first_ride_on: 'First Ride',
  last_ride_on: 'Last Ride',
  average_power: 'Avg Power',
  total_elevation_gain: 'Elevation',
  installed_components_count: 'Installed Components',
}

export const DEFAULT_BIKE_LIST_COLUMNS: BikeListColumn[] = [
  'make_model',
  'total_distance',
  'total_moving_time',
  'first_ride_on',
]

export const BIKE_LIST_SORT_COLUMNS = ['name', ...BIKE_LIST_COLUMNS] as const

export type BikeListSortColumn = (typeof BIKE_LIST_SORT_COLUMNS)[number]
