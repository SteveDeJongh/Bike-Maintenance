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

// Must match the inclusion list on ComponentAssignment#ride_context in
// api/app/models/component_assignment.rb exactly. Just display labels for a
// backend-real enum, not a classification rule.
export const RIDE_CONTEXTS = ['both', 'outdoor_only', 'indoor_only'] as const

export const RIDE_CONTEXT_LABELS: Record<(typeof RIDE_CONTEXTS)[number], string> = {
  both: 'Both',
  outdoor_only: 'Outdoor only',
  indoor_only: 'Trainer only',
}

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

// The toggleable columns on the Bike detail page's two component tables
// (Installed components, History). Category and Component are always-shown,
// leading (pinned) columns on both tables — not part of either list below,
// but still sortable (see the *_SORT_COLUMNS exports). "period_*" columns are
// accrued only during one specific installation (this stint on this bike);
// "component_*" columns are the mounted component's lifetime totals across
// every bike it's ever been on — both are wanted side by side, not as
// alternatives to each other.
export const INSTALLED_COMPONENT_COLUMNS = [
  'period_distance',
  'period_time',
  'period_elevation',
  'period_avg_power',
  'component_total_distance',
  'component_total_time',
  'component_total_elevation',
  'component_avg_power',
  'distance_since_wax',
  'installed_on',
] as const

export type InstalledComponentColumn = (typeof INSTALLED_COMPONENT_COLUMNS)[number]

export const INSTALLED_COMPONENT_COLUMN_LABELS: Record<InstalledComponentColumn, string> = {
  period_distance: 'Distance',
  period_time: 'Time',
  period_elevation: 'Elevation',
  period_avg_power: 'Avg Power',
  component_total_distance: 'Total Distance',
  component_total_time: 'Total Time',
  component_total_elevation: 'Total Elevation',
  component_avg_power: 'Total Avg Power',
  distance_since_wax: 'Since Wax',
  installed_on: 'Installed On',
}

export const DEFAULT_INSTALLED_COMPONENT_COLUMNS: InstalledComponentColumn[] = [
  'period_distance',
  'installed_on',
  'distance_since_wax',
]

export const INSTALLED_COMPONENT_SORT_COLUMNS = [
  'category',
  'component_label',
  ...INSTALLED_COMPONENT_COLUMNS,
] as const

export type InstalledComponentSortColumn = (typeof INSTALLED_COMPONENT_SORT_COLUMNS)[number]

export const HISTORY_COLUMNS = [
  'period_distance',
  'period_time',
  'period_elevation',
  'period_avg_power',
  'component_total_distance',
  'component_total_time',
  'component_total_elevation',
  'component_avg_power',
  'distance_since_wax',
  'started_on',
  'ended_on',
] as const

export type HistoryColumn = (typeof HISTORY_COLUMNS)[number]

export const HISTORY_COLUMN_LABELS: Record<HistoryColumn, string> = {
  period_distance: 'Distance',
  period_time: 'Time',
  period_elevation: 'Elevation',
  period_avg_power: 'Avg Power',
  component_total_distance: 'Total Distance',
  component_total_time: 'Total Time',
  component_total_elevation: 'Total Elevation',
  component_avg_power: 'Total Avg Power',
  distance_since_wax: 'Since Wax',
  started_on: 'Installed',
  ended_on: 'Uninstalled',
}

export const DEFAULT_HISTORY_COLUMNS: HistoryColumn[] = ['started_on', 'ended_on', 'period_distance']

export const HISTORY_SORT_COLUMNS = ['category', 'component_label', ...HISTORY_COLUMNS] as const

export type HistorySortColumn = (typeof HISTORY_SORT_COLUMNS)[number]

// The toggleable columns on the Components list. Label is the always-shown,
// leading (pinned) linked column — not part of this list, but still sortable.
export const COMPONENT_LIST_COLUMNS = ['category', 'acquired_on', 'retired_on'] as const

export type ComponentListColumn = (typeof COMPONENT_LIST_COLUMNS)[number]

export const COMPONENT_LIST_COLUMN_LABELS: Record<ComponentListColumn, string> = {
  category: 'Category',
  acquired_on: 'Acquired',
  retired_on: 'Retired',
}

export const DEFAULT_COMPONENT_LIST_COLUMNS: ComponentListColumn[] = [
  'category',
  'acquired_on',
  'retired_on',
]

export const COMPONENT_LIST_SORT_COLUMNS = ['label', ...COMPONENT_LIST_COLUMNS] as const

export type ComponentListSortColumn = (typeof COMPONENT_LIST_SORT_COLUMNS)[number]

// The toggleable columns on the Maintenance Events list. Component is the
// always-shown, leading (pinned) linked column — there's no other natural
// anchor, since an event has no detail page of its own.
export const MAINTENANCE_EVENT_LIST_COLUMNS = ['performed_at', 'event_type', 'notes'] as const

export type MaintenanceEventListColumn = (typeof MAINTENANCE_EVENT_LIST_COLUMNS)[number]

export const MAINTENANCE_EVENT_LIST_COLUMN_LABELS: Record<MaintenanceEventListColumn, string> = {
  performed_at: 'Performed At',
  event_type: 'Type',
  notes: 'Notes',
}

export const DEFAULT_MAINTENANCE_EVENT_LIST_COLUMNS: MaintenanceEventListColumn[] = [
  'performed_at',
  'event_type',
  'notes',
]

export const MAINTENANCE_EVENT_LIST_SORT_COLUMNS = [
  'component_label',
  ...MAINTENANCE_EVENT_LIST_COLUMNS,
] as const

export type MaintenanceEventListSortColumn = (typeof MAINTENANCE_EVENT_LIST_SORT_COLUMNS)[number]

// The toggleable columns on the Assignments list. Component and Bike are both
// always-shown, leading (pinned) linked columns — a row's identity needs both
// coordinates, same reasoning as Category+Component on the Bike detail
// tables. Category (derived from the component) is just a regular
// configurable column here, not pinned.
export const ASSIGNMENT_LIST_COLUMNS = ['category', 'started_at', 'ended_at'] as const

export type AssignmentListColumn = (typeof ASSIGNMENT_LIST_COLUMNS)[number]

export const ASSIGNMENT_LIST_COLUMN_LABELS: Record<AssignmentListColumn, string> = {
  category: 'Category',
  started_at: 'Started',
  ended_at: 'Ended',
}

export const DEFAULT_ASSIGNMENT_LIST_COLUMNS: AssignmentListColumn[] = [
  'category',
  'started_at',
  'ended_at',
]

export const ASSIGNMENT_LIST_SORT_COLUMNS = [
  'component_label',
  'bike_name',
  ...ASSIGNMENT_LIST_COLUMNS,
] as const

export type AssignmentListSortColumn = (typeof ASSIGNMENT_LIST_SORT_COLUMNS)[number]
