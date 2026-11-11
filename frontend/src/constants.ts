// Picker order: drivetrain, wheels and tires, brakes, contact points, frame
// and suspension, power meter -- not alphabetical, not insertion order.
export const COMPONENT_CATEGORIES = [
  'chain',
  'cassette',
  'chainring',
  'bottom_bracket',
  'wheel_front',
  'wheel_rear',
  'tire_front',
  'tire_rear',
  'brake_pads_front',
  'brake_pads_rear',
  'saddle',
  'handlebar_tape',
  'pedals',
  'frame',
  'front_suspension',
  'rear_suspension',
  'seat_post',
  'power_meter',
] as const

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number]

export const COMPONENT_CATEGORY_LABELS: Record<ComponentCategory, string> = {
  chain: 'Chain',
  cassette: 'Cassette',
  chainring: 'Chainring',
  bottom_bracket: 'Bottom Bracket',
  wheel_front: 'Front Wheel',
  wheel_rear: 'Rear Wheel',
  tire_front: 'Front Tire',
  tire_rear: 'Rear Tire',
  brake_pads_front: 'Front Brake Pads',
  brake_pads_rear: 'Rear Brake Pads',
  saddle: 'Saddle',
  // Label only -- the key stays handlebar_tape (renaming it would mean a
  // data migration across components/slots/settings/intervals for no gain).
  handlebar_tape: 'Handlebar Tape/Grips',
  pedals: 'Pedals',
  frame: 'Frame',
  front_suspension: 'Front Suspension',
  rear_suspension: 'Rear Suspension',
  seat_post: 'Seat Post',
  power_meter: 'Power Meter',
}

// Known baseline categories use their hand-authored label; a custom category
// (added via the Settings page) has no stored display label, so this
// titleizes its lower_snake_case key instead -- a plain round-trip, so
// unusual capitalization/acronyms (e.g. "MTB Fork") won't come back exactly
// as typed.
export function categoryLabel(category: string): string {
  const known = COMPONENT_CATEGORY_LABELS[category as ComponentCategory]
  if (known) return known

  return category
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Must match the inclusion list on ComponentAssignment#ride_context in
// api/app/models/component_assignment.rb exactly. Just display labels for a
// backend-real enum, not a classification rule.
export const RIDE_CONTEXTS = ['both', 'outdoor_only', 'indoor_only'] as const

export const RIDE_CONTEXT_LABELS: Record<(typeof RIDE_CONTEXTS)[number], string> = {
  both: 'All',
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
  'bike_type',
  'acquired_on',
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
  bike_type: 'Type',
  acquired_on: 'Purchased On',
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
  'service_status',
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
  service_status: 'Service Status',
  installed_on: 'Installed On',
}

export const DEFAULT_INSTALLED_COMPONENT_COLUMNS: InstalledComponentColumn[] = [
  'period_distance',
  'installed_on',
  'service_status',
]

export const INSTALLED_COMPONENT_SORT_COLUMNS = [
  'category',
  'ride_context',
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
  started_on: 'Installed',
  ended_on: 'Uninstalled',
}

export const DEFAULT_HISTORY_COLUMNS: HistoryColumn[] = ['started_on', 'ended_on', 'period_distance']

export const HISTORY_SORT_COLUMNS = ['category', 'component_label', ...HISTORY_COLUMNS] as const

export type HistorySortColumn = (typeof HISTORY_SORT_COLUMNS)[number]

// The toggleable columns on the Components list. Label is the always-shown,
// leading (pinned) linked column — not part of this list, but still sortable.
export const COMPONENT_LIST_COLUMNS = [
  'category', 'acquired_on', 'retired_on', 'brand', 'model', 'service_status', 'current_bikes',
] as const

export type ComponentListColumn = (typeof COMPONENT_LIST_COLUMNS)[number]

export const COMPONENT_LIST_COLUMN_LABELS: Record<ComponentListColumn, string> = {
  category: 'Category',
  acquired_on: 'Acquired',
  retired_on: 'Retired',
  brand: 'Brand',
  model: 'Model',
  service_status: 'Service Status',
  current_bikes: 'Current Bike',
}

// Shared by every table/badge rendering a component's service_status --
// color for the badge, numeric priority (due > warning > ok) for sorting a
// column of them, same severity order the backend's
// Maintenance::IntervalStatus.worst_status_by_component uses to pick one
// status per component.
export const SERVICE_STATUS_COLORS: Record<'ok' | 'warning' | 'due', string> = {
  ok: 'teal', // not 'green' -- would collide with the primaryColor 'radar' accent in dark mode
  warning: 'yellow',
  due: 'red',
}

export const SERVICE_STATUS_SEVERITY: Record<'ok' | 'warning' | 'due', number> = {
  ok: 0,
  warning: 1,
  due: 2,
}

export const DEFAULT_COMPONENT_LIST_COLUMNS: ComponentListColumn[] = [
  'category',
  'acquired_on',
  'retired_on',
  'service_status',
]

export const COMPONENT_LIST_SORT_COLUMNS = ['label', ...COMPONENT_LIST_COLUMNS] as const

export type ComponentListSortColumn = (typeof COMPONENT_LIST_SORT_COLUMNS)[number]

// The toggleable columns on the Maintenance Events list. Component is the
// always-shown, leading (pinned) linked column — there's no other natural
// anchor, since an event has no detail page of its own.
export const MAINTENANCE_EVENT_LIST_COLUMNS = ['performed_at', 'service_type', 'notes'] as const

export type MaintenanceEventListColumn = (typeof MAINTENANCE_EVENT_LIST_COLUMNS)[number]

export const MAINTENANCE_EVENT_LIST_COLUMN_LABELS: Record<MaintenanceEventListColumn, string> = {
  performed_at: 'Performed At',
  service_type: 'Type',
  notes: 'Notes',
}

export const DEFAULT_MAINTENANCE_EVENT_LIST_COLUMNS: MaintenanceEventListColumn[] = [
  'performed_at',
  'service_type',
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

// The toggleable columns on the Bike detail page's Ride history table. Date
// and Name are always-shown, leading (pinned) columns — not part of this
// list. Unlike every other adopter, this table has no spread-in pinned-column
// sort constant: the only sortable thing is the date order, driven by the
// section's own order toggle (Newest/Oldest first), never by clicking a
// column header — see RideHistorySection and DraggableHeaderCell's
// `sortable` prop.
export const BIKE_RIDE_COLUMNS = [
  'ride_kind',
  'distance_meters',
  'cumulative_distance_meters',
  'moving_time',
  'total_elevation_gain',
  'average_speed',
  'average_watts',
  'activity_type',
  'elapsed_time',
  'max_speed',
  'weighted_average_watts',
  'kilojoules',
  'average_heartrate',
  'max_heartrate',
  'average_cadence',
  'commute',
  'counted_toward',
] as const

export type BikeRideColumn = (typeof BIKE_RIDE_COLUMNS)[number]

export const BIKE_RIDE_COLUMN_LABELS: Record<BikeRideColumn, string> = {
  ride_kind: 'Type',
  distance_meters: 'Distance',
  cumulative_distance_meters: 'Odometer',
  moving_time: 'Moving time',
  total_elevation_gain: 'Elevation',
  average_speed: 'Avg speed',
  average_watts: 'Avg power',
  activity_type: 'Sport type',
  elapsed_time: 'Elapsed time',
  max_speed: 'Max speed',
  weighted_average_watts: 'Weighted avg power',
  kilojoules: 'Energy (kJ)',
  average_heartrate: 'Avg HR',
  max_heartrate: 'Max HR',
  average_cadence: 'Avg cadence',
  commute: 'Commute',
  counted_toward: 'Counted toward',
}

export const DEFAULT_BIKE_RIDE_COLUMNS: BikeRideColumn[] = [
  'ride_kind',
  'distance_meters',
  'cumulative_distance_meters',
  'moving_time',
  'total_elevation_gain',
  'average_speed',
  'average_watts',
]

export const RIDE_KIND_BADGE: Record<'outdoor' | 'trainer' | 'virtual', { label: string; color: string }> = {
  outdoor: { label: 'Outdoor', color: 'radar' },
  virtual: { label: 'Virtual', color: 'gray' },
  trainer: { label: 'Trainer', color: 'gray' },
}

// The toggleable columns on the Strava page's Rides tab table. Selection
// checkbox, Date, and Name are pinned (not part of this list) -- same
// "pinned/configurable" split as everywhere else. Status/Gear/Bike/Ignored
// on are new here; every other column is shared with Ride history's own
// set (minus Odometer, which only makes sense for one bike).
export const STRAVA_RIDE_COLUMNS = [
  'status',
  'gear',
  'bike',
  'distance_meters',
  'ride_kind',
  'moving_time',
  'total_elevation_gain',
  'average_speed',
  'average_watts',
  'activity_type',
  'elapsed_time',
  'max_speed',
  'weighted_average_watts',
  'kilojoules',
  'average_heartrate',
  'max_heartrate',
  'average_cadence',
  'commute',
  'counted_toward',
  'ignored_at',
] as const

export type StravaRideColumn = (typeof STRAVA_RIDE_COLUMNS)[number]

export const STRAVA_RIDE_COLUMN_LABELS: Record<StravaRideColumn, string> = {
  status: 'Status',
  gear: 'Gear',
  bike: 'Bike',
  distance_meters: 'Distance',
  ride_kind: 'Type',
  moving_time: 'Moving time',
  total_elevation_gain: 'Elevation',
  average_speed: 'Avg speed',
  average_watts: 'Avg power',
  activity_type: 'Sport type',
  elapsed_time: 'Elapsed time',
  max_speed: 'Max speed',
  weighted_average_watts: 'Weighted avg power',
  kilojoules: 'Energy (kJ)',
  average_heartrate: 'Avg HR',
  max_heartrate: 'Max HR',
  average_cadence: 'Avg cadence',
  commute: 'Commute',
  counted_toward: 'Counted toward',
  ignored_at: 'Ignored on',
}

export const DEFAULT_STRAVA_RIDE_COLUMNS: StravaRideColumn[] = ['status', 'gear', 'bike', 'distance_meters', 'ride_kind', 'moving_time']

// The Activity log's three kind chips -- each UI kind's display name,
// Tabler icon name, and its matching meta.kind_counts key. 'service' covers
// both service_session and session-less maintenance_event entries, which
// share one bucket here and in Activity::Feed's own kind_rank.
export const ACTIVITY_UI_KINDS = ['ride', 'service', 'setup'] as const

export const ACTIVITY_KIND_LABELS: Record<(typeof ACTIVITY_UI_KINDS)[number], string> = {
  ride: 'Rides',
  service: 'Service',
  setup: 'Setup changes',
}

export const DEFAULT_ACTIVITY_KINDS: (typeof ACTIVITY_UI_KINDS)[number][] = ['ride']

// The toggleable columns on the Activity log table. The icon gutter, Date,
// and Name are always-shown, leading (pinned) columns -- not part of this
// list. Every shared ride column (see SHARED_RIDE_COLUMN_RENDERERS) is
// available here too, plus this page's own Bike column; a non-ride row
// always spans every visible one of these in a single merged cell.
export const ACTIVITY_LOG_COLUMNS = [
  'bike',
  'ride_kind',
  'distance_meters',
  'moving_time',
  'total_elevation_gain',
  'average_speed',
  'average_watts',
  'activity_type',
  'elapsed_time',
  'max_speed',
  'weighted_average_watts',
  'kilojoules',
  'average_heartrate',
  'max_heartrate',
  'average_cadence',
  'commute',
  'counted_toward',
] as const

export type ActivityLogColumn = (typeof ACTIVITY_LOG_COLUMNS)[number]

export const ACTIVITY_LOG_COLUMN_LABELS: Record<ActivityLogColumn, string> = {
  bike: 'Bike',
  ride_kind: 'Type',
  distance_meters: 'Distance',
  moving_time: 'Moving time',
  total_elevation_gain: 'Elevation',
  average_speed: 'Avg speed',
  average_watts: 'Avg power',
  activity_type: 'Sport type',
  elapsed_time: 'Elapsed time',
  max_speed: 'Max speed',
  weighted_average_watts: 'Weighted avg power',
  kilojoules: 'Energy (kJ)',
  average_heartrate: 'Avg HR',
  max_heartrate: 'Max HR',
  average_cadence: 'Avg cadence',
  commute: 'Commute',
  counted_toward: 'Counted toward',
}

export const DEFAULT_ACTIVITY_LOG_COLUMNS: ActivityLogColumn[] = [
  'bike',
  'ride_kind',
  'distance_meters',
  'moving_time',
  'total_elevation_gain',
  'average_watts',
]

// Keyed by reason, with 'attributed' standing in for the null-reason
// attributed case -- covers all five labels the Rides tab's Status column
// shows. teal/yellow/gray mirror SERVICE_STATUS_COLORS' own ok/warning/
// neutral convention rather than inventing new semantics.
export const RIDE_STATUS_BADGE: Record<'unmapped_gear' | 'no_gear' | 'ride' | 'gear' | 'attributed', { label: string; color: string }> = {
  unmapped_gear: { label: 'Unmapped gear', color: 'yellow' },
  no_gear: { label: 'No gear on Strava', color: 'yellow' },
  ride: { label: 'Ignored', color: 'gray' },
  gear: { label: 'Gear ignored', color: 'gray' },
  attributed: { label: 'Attributed', color: 'teal' },
}
