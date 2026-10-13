export interface Bike {
  id: number
  name: string
  make: string | null
  model: string | null
  strava_gear_id: string | null
  retired_on: string | null
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
}

export interface MaintenanceEvent {
  id: number
  component_id: number
  event_type: 'wax' | 'clean' | 'replace' | 'inspect'
  performed_at: string
  notes: string | null
}
