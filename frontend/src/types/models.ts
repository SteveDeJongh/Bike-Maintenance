export interface Bike {
  id: number
  name: string
  make: string | null
  model: string | null
  strava_gear_id: string | null
  retired_on: string | null
  created_at: string
}

// A slot is independently created/removed per (category, ride_context) --
// 'both' (the default, one slot per category) unless the category's
// ComponentCategorySetting#allows_multiple_assignments permits splitting
// into separate outdoor_only/indoor_only slots that are tracked and removed
// independently of each other.
export interface BikeComponentSlot {
  id: number
  bike_id: number
  category: string
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
}

export interface BikeWithStats extends Bike {
  total_distance: number
  total_moving_time: number
  first_ride_on: string | null
  last_ride_on: string | null
  // nil when the bike has no device-metered (real power meter) activities —
  // distinct from 0, which would misleadingly read as "rode with no effort".
  average_power: number | null
  total_elevation_gain: number
  installed_components_count: number
}

// component_assignments/bike_component_slots are only present on GET /bikes/:id
// (see BikesController#show), not on the index list used by useBikes() — same
// convention as ComponentDetail below.
export interface BikeDetail extends BikeWithStats {
  bike_component_slots: BikeComponentSlot[]
  component_assignments: ComponentAssignmentWithStats[]
}

// Lifetime totals, computed across every assignment a component has ever had
// on any bike — distinct from ComponentAssignmentWithStats's per-installation
// figures below. average_power is nil (not 0) when there's no device-metered
// data, same convention as Bike#average_power.
export interface ComponentWithLifetimeStats extends ComponentWithServiceStatus {
  total_distance: number
  total_moving_time: number
  total_elevation_gain: number
  average_power: number | null
}

// Per-installation-period figures — accrued only between this one
// assignment's started_at and ended_at (or now, if still mounted) — plus the
// mounted component's own lifetime stats, nested. Only present on the
// component_assignments embedded in GET /bikes/:id, not on the flat
// GET /component_assignments list (which stays unenriched to avoid an N+1
// risk across a user's entire, unbounded assignment history).
export interface ComponentAssignmentWithStats extends ComponentAssignment {
  distance_meters: number
  moving_time: number
  elevation_gain: number
  average_power: number | null
  component: ComponentWithLifetimeStats
}

// The raw shape GET /table_view_preferences/:table_key returns under "data" —
// a table a user hasn't configured yet gets `{}`, so every field is
// optional; the frontend applies its own defaults when unset. `columns` is
// both the visible set AND its display order (position = order), not a
// separate unordered list.
export interface TableViewPreferenceData {
  columns?: string[]
  sort_column?: string | null
  sort_direction?: 'asc' | 'desc'
}

// null means no enabled service interval at all (not "ok") -- the Components
// list and Bike detail's Installed components table render that as a dash
// rather than a status badge.
export type ServiceStatus = 'ok' | 'warning' | 'due'

export interface Component {
  id: number
  label: string
  category: string
  acquired_on: string
  retired_on: string | null
  // total_distance intentionally omitted: only present on GET /components/:id
  // (see ComponentDetail below), not on the index list used here.
}

// GET /components adds this read-only field on top of Component's own
// columns -- kept separate from Component itself (rather than folded in
// directly) so ComponentPayload (Omit<Component, 'id'>, used by
// ComponentFormModal's create/update calls) doesn't end up requiring a
// server-computed field no form could ever send.
export interface ComponentWithServiceStatus extends Component {
  // The worst status across this component's enabled service intervals --
  // batched server-side (Maintenance::IntervalStatus.worst_status_by_component),
  // not a per-row query.
  service_status: ServiceStatus | null
}

export interface ComponentDetail extends Component {
  total_distance: number
  service_intervals: ComponentServiceIntervalWithStatus[]
}

// Fields suffixed _at are ISO-8601 timestamps; _on fields are date-only
// (YYYY-MM-DD), matching the API's column naming convention.
export interface ComponentAssignment {
  id: number
  component_id: number
  bike_id: number
  started_at: string
  ended_at: string | null
  // Which rides this assignment's mileage is drawn from — 'both' (default),
  // 'outdoor_only', or 'indoor_only' (StravaActivity#trainer rides only).
  // Lets a dedicated indoor-only component and a dedicated outdoor-only one
  // of the same category both be "installed" on the same bike at once.
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
}

// User-serviceable per-category settings, upserted by category via
// GET/PATCH /component_category_settings/:category. A missing row (category
// never touched) behaves as default_ride_context: 'both', trackable: true,
// allows_multiple_assignments: false -- the same values these columns default
// to in the database.
export interface ComponentCategorySetting {
  category: string
  // Which ride_context to pre-select when installing a new component of this
  // category -- not a restriction on what any individual assignment's own
  // ride_context can be set to.
  default_ride_context: 'both' | 'outdoor_only' | 'indoor_only'
  // Whether this category is offered anywhere a new slot/component is
  // created (the Bike detail "+ Track a new component type" dropdown, the
  // standalone Components page's category picker). Never retroactive --
  // already-tracked slots/components keep working regardless.
  trackable: boolean
  // Whether the backend permits a second, mutually-exclusive-ride-context
  // component installed in the same (bike, category) slot at once (e.g. a
  // dedicated outdoor cassette alongside a dedicated trainer cassette).
  // Enforced server-side in ComponentAssignment, not just a frontend hint.
  allows_multiple_assignments: boolean
  // Per-category notification overrides -- null means "inherit the global
  // NotificationSetting", same missing-value-means-inherit convention as
  // default_ride_context's own column default.
  notifications_enabled: boolean | null
  warning_threshold_percent: number | null
}

// A per-category suggested service interval ("wax every 300km"), applied to
// that category's components as a linked ComponentServiceInterval -- see
// ComponentServiceInterval below.
export interface CategoryServiceInterval {
  id: number
  category: string
  service_type_id: number
  distance_interval_meters: number | null
  time_interval_days: number | null
}

// What actually applies to one component: either linked to a
// CategoryServiceInterval template (category_service_interval_id set,
// inheriting the template's values live unless overridden here) or fully
// custom (category_service_interval_id null, values always its own).
export interface ComponentServiceInterval {
  id: number
  component_id: number
  category_service_interval_id: number | null
  service_type_id: number
  distance_interval_meters: number | null
  time_interval_days: number | null
  enabled: boolean
}

// The enriched shape GET /components/:id returns for each interval --
// ComponentServiceInterval's own columns plus the live-computed status.
export interface ComponentServiceIntervalWithStatus extends ComponentServiceInterval {
  effective_distance_interval_meters: number | null
  effective_time_interval_days: number | null
  service_type_name: string
  status: ServiceStatus
  distance_remaining_meters: number | null
  days_remaining: number | null
  driving_dimension: 'distance' | 'days'
}

// Singleton per user, GET/PATCH /notification_settings. id is null when the
// user has no row yet -- the response still carries the real hardcoded
// defaults (true/5), never a separate "missing" shape to special-case.
export interface NotificationSetting {
  id: number | null
  notifications_enabled: boolean
  warning_threshold_percent: number
}

// GET /maintenance_alerts -- banner-eligible (installed, not retired,
// notifications on, not currently dismissed) non-ok statuses across every
// component. status is never 'ok' here (see ServiceStatus); only due/warning
// alerts are ever eligible for the banners.
export interface MaintenanceAlert {
  component_service_interval_id: number
  component_id: number
  component_label: string
  category: string
  service_type_name: string
  status: 'warning' | 'due'
  distance_remaining_meters: number | null
  days_remaining: number | null
}

// User-defined kind of maintenance (wax, sealant top-up, brake bleed, ...) --
// replaces the old hardcoded event_type enum, since this now drives real
// computation (service intervals) rather than being descriptive free text.
export interface ServiceType {
  id: number
  name: string
}

export interface MaintenanceEvent {
  id: number
  component_id: number
  service_type_id: number
  performed_at: string
  notes: string | null
}

export interface StravaStatus {
  connected: boolean
  athlete_id: number | null
}

export interface StravaGear {
  gear_id: string
  name: string | null
  brand_name: string | null
  model_name: string | null
  retired: boolean
  activity_count: number
  distance_meters: number
}

export interface StravaMappedBike {
  bike_id: number
  bike_name: string
  gear_id: string
  name: string | null
  brand_name: string | null
  model_name: string | null
  retired: boolean
  activity_count: number
  distance_meters: number
}
