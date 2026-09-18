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
  // only present on GET /components/:id, not on the index list used here.
}

export interface ComponentAssignment {
  id: number
  component_id: number
  bike_id: number
  started_on: string
  ended_on: string | null
}

export interface MaintenanceEvent {
  id: number
  component_id: number
  event_type: 'wax' | 'clean' | 'replace' | 'inspect'
  performed_on: string
  notes: string | null
}
