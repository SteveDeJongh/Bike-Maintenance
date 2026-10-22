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
export interface ComponentWithLifetimeStats extends Component {
  total_distance: number
  total_moving_time: number
  total_elevation_gain: number
  average_power: number | null
  distance_since_wax: number
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

export interface Component {
  id: number
  label: string
  category: string
  acquired_on: string
  retired_on: string | null
  // total_distance / distance_since_wax intentionally omitted:
  // only present on GET /components/:id (see ComponentDetail below), not on
  // the index list used here.
}

export interface ComponentDetail extends Component {
  total_distance: number
  distance_since_wax: number
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
}

export interface MaintenanceEvent {
  id: number
  component_id: number
  event_type: 'wax' | 'clean' | 'replace' | 'inspect'
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
