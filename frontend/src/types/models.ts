export interface UserIdentitySummary {
  provider: string
  email: string | null
}

export interface User {
  id: number
  name: string
  email: string | null
  email_verified: boolean
  has_password: boolean
  identities: UserIdentitySummary[]
  strava_connected: boolean
}

export interface Bike {
  id: number
  name: string
  make: string | null
  model: string | null
  strava_gear_id: string | null
  bike_type_id: number | null
  acquired_on: string | null
  retired_on: string | null
  created_at: string
}

// A user-editable preset (Road/Gravel/Mountain/...) pre-checking categories
// in the new-bike component setup checklist -- purely a frontend-facing
// convenience, never enforced against or retroactively applied to any
// existing bike's slots/components/assignments.
export interface BikeType {
  id: number
  name: string
  default_categories: string[]
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

// The stats GET /bikes and GET /bikes/:id both return.
export interface BikeStats {
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

// A GET /bikes row: the shared stats plus what the Bikes page's cards and
// tiles need (list only; GET /bikes/:id doesn't return these).
export interface BikeWithStats extends Bike, BikeStats {
  ride_count: number
  // The categories the bike tracks (any slot) -- Install on bike's "Not
  // tracked on this bike".
  slot_categories: string[]
  // Since local Jan 1 in the zone useBikes sends.
  distance_this_year: number
  last_ride_activity_type: string | null
  // Mounted components by their worst status (each counts once).
  status_counts: { due: number; warning: number }
  // Up to three mounted components: those with an enabled requirement,
  // most due first, then those without (category order, then label; with
  // their lifetime total_distance_meters). The ride modal's shape.
  next_service: RideDetailComponent[]
}

// component_assignments/bike_component_slots are only present on GET /bikes/:id
// (see BikesController#show), not on the index list used by useBikes() — same
// convention as ComponentDetail below.
export interface BikeDetail extends Bike, BikeStats {
  ride_count: number
  // Since local Jan 1 in the zone useBike sends.
  distance_this_year: number
  // The linked gear (name from the gear cache; null if not cached), or
  // null when the bike isn't linked to Strava gear.
  strava_gear: { gear_id: string; name: string | null } | null
  // The bike page's Up next (Home's lists, scoped to this bike's mounted
  // components) and its mounted/off-bike components for the rotation cards.
  overview: {
    attention: DashboardAttentionItem[]
    upcoming: DashboardRequirementItem[]
    mounted: DashboardMountedComponent[]
    off_bike: DashboardOffBikeComponent[]
  }
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
  // Activity log's persisted kind-chip selection -- stored alongside this
  // same table's column/sort prefs (see useTableViewPreferences' extraData
  // option) rather than a second preference row, since the backend already
  // treats this whole value as free-form per-table JSON.
  kinds?: string[]
  // A grouped list's grouping, validated server-side per table_key (the
  // one key that is): Activity log "week" | "none" ("week" when absent);
  // Components list "category" | "bike" | "none" ("category" when absent).
  group_by?: string
  // Bikes page (table_key "bikes"): Cards | Table, the card sort and
  // whether retired bikes show. Free-form like columns; useBikesView
  // validates them on load.
  view?: string
  card_sort?: string
  show_retired?: boolean
  // Components list (table_key "components"): the state pills and the
  // Category / Bike / Service status filters. useComponentsView validates
  // them on load.
  states?: string[]
  category?: string | null
  bike_id?: number | null
  service?: string | null
  // Maintenance page (table_key "maintenance_events"), alongside kinds,
  // group_by ("month" | "component" | "none"), category and bike_id: the
  // Service type filter and the date range ("all" for All time; the
  // custom range's from/to). useMaintenanceLogView validates them on load.
  service_type_id?: number | null
  date_preset?: string
  date_range?: [string | null, string | null]
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
  brand: string | null
  model: string | null
  notes: string | null
  // No distance here: the list's is lifetime_distance_meters
  // (ComponentListItem), the page's lifetime_stats (ComponentDetail).
}

// One bike a component currently has an active (ended_at: nil) assignment
// on. Usually at most one, but a component can be shared indoor_only
// across two bikes at once (see ComponentAssignment's documented
// allows_multiple_assignments exception) -- callers always treat this as
// a list, never assume a single bike.
export interface ComponentCurrentBike {
  id: number
  name: string
  // Only present on GET /components/:id (ComponentDetail), not the
  // Components list's own current_bikes -- the one-step swap action needs
  // this assignment's own id, which the list has no use for.
  assignment_id?: number
  // That assignment's ride_context -- swapOptions needs it to tell a
  // shared indoor cassette from one that can't be shared.
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
  // The bike's retirement (GET /components/:id only): an open assignment on
  // a retired bike isn't "Current" (installationStatus).
  retired_on?: string | null
}

// The bike of a component's most recently ended assignment -- set only
// when the component isn't currently mounted anywhere (retired included),
// null when mounted or never installed.
export interface ComponentLastBike {
  id: number
  name: string
  removed_at: string
}

// GET /components adds these read-only fields on top of Component's own
// columns -- kept separate from Component itself (rather than folded in
// directly) so ComponentPayload (Omit<Component, 'id'>, used by
// ComponentFormModal's create/update calls) doesn't end up requiring
// server-computed fields no form could ever send.
export interface ComponentWithServiceStatus extends Component {
  // Retired, or left on retired bikes only (Component.effectively_retired):
  // out of the inventory. effective_retired_on is retired_on, else the
  // latest retired_on of those bikes -- the date shown and sorted by.
  effectively_retired: boolean
  effective_retired_on: string | null
  // The worst status across this component's enabled service intervals --
  // batched server-side (Maintenance::IntervalStatus.worst_status_by_component),
  // not a per-row query.
  service_status: ServiceStatus | null
  current_bikes: ComponentCurrentBike[]
  last_bike: ComponentLastBike | null
}

// One row of GET /components: the list fields above plus, all batched
// server-side, the worst enabled requirement's wear (Maintenance::WearFields;
// all null with none), lifetime distance, when it went on its bike(s), and
// the raw inputs for a rotating spare's "<service> · ready" reading
// (spareReadyLabel). Installed / spare / retired: componentState.
export interface ComponentListItem extends ComponentWithServiceStatus {
  fraction_used: number | null
  driving_dimension: RequirementDimension | null
  distance_remaining_meters: number | null
  moving_time_remaining_seconds: number | null
  days_remaining: number | null
  has_enabled_requirement: boolean
  // The driving (worst) requirement's name, for a status chip ("Wax due");
  // null with no enabled requirement.
  worst_requirement_name: string | null
  lifetime_distance_meters: number
  // The earliest open assignment's started_at (a shared indoor cassette has
  // one per bike); null when not installed.
  assigned_since: string | null
  // The category rotates (ComponentCategorySetting#rotates).
  rotates: boolean
  latest_service: { service_type_name: string; performed_at: string } | null
}

export interface ComponentDetail extends Component {
  // See ComponentWithServiceStatus.
  effectively_retired: boolean
  effective_retired_on: string | null
  service_requirements: ComponentServiceRequirementWithStatus[]
  current_bikes: ComponentCurrentBike[]
  last_bike: ComponentLastBike | null
  // The component page's history (Components::LifeHistory), all batched.
  assignments: ComponentInstallation[]
  lifetime_stats: ComponentLifetimeStats
  maintenance_events: ComponentMaintenanceEvent[]
  maintenance_events_count: number
  // No assignment and no maintenance event: DELETE is allowed. Otherwise
  // it 422s ("Retire it instead").
  deletable: boolean
}

// One installation of a component (every assignment, newest first), with
// the distance attributed to that stint.
export interface ComponentInstallation {
  id: number
  // retired_on: an open stint on a retired bike isn't "Current".
  bike: { id: number; name: string; retired_on: string | null }
  started_at: string
  ended_at: string | null
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
  distance_meters: number
}

export interface ComponentLifetimeStats {
  distance_meters: number
  moving_time_seconds: number
  elevation_gain_meters: number
  // null without power-meter rides.
  average_power: number | null
}

// A maintenance event as the component page lists it.
// component_distance_at_event_meters: the component's lifetime distance
// from rides strictly before performed_at. mounted_at_event: on a bike at
// the time (false shows "Off the bike"). session_components: the other
// components logged in the same service session.
export interface ComponentMaintenanceEvent extends MaintenanceEvent {
  service_type_name: string
  component_distance_at_event_meters: number
  mounted_at_event: boolean
  session_components: { id: number; label: string }[]
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
  // Whether components of this category rotate on a bike (two waxed
  // chains) -- gates the dashboard's rotation strip. Chain is true by
  // default; everything else, custom categories included, false.
  rotates: boolean
  // Per-category notification overrides -- null means "inherit the global
  // NotificationSetting", same missing-value-means-inherit convention as
  // default_ride_context's own column default.
  notifications_enabled: boolean | null
  warning_threshold_percent: number | null
  // Seeded per category (e.g. Shimano/SRAM for chain) via Users::Provision,
  // fully user-editable from here on -- the "Common brands" group in the
  // brand autocomplete (see ComponentBrandModelInputs). A category with no
  // seed (frame, or any custom category) just starts at [].
  common_brands: string[]
  // Set for the three front/rear pairs (tire_front/tire_rear,
  // wheel_front/wheel_rear, brake_pads_front/brake_pads_rear) --
  // common_brands is kept identical between a category and its partner by
  // the backend (ComponentCategorySettings::UpdateCommonBrands). null for
  // every other category, including ones merely seeded from the same brand
  // group (e.g. chain/cassette).
  brand_list_partner: string | null
}

// --- Service requirements (replaces the old single-service-type
// CategoryServiceInterval/ComponentServiceInterval types/endpoints, fully
// migrated off as of increment 6) ---
//
// See CLAUDE.md "Service intervals and maintenance alerts": a requirement
// (e.g. "Chain lube") comes due on up to three independent dimensions
// (distance/moving_time/calendar), is cleared by one or more satisfiers
// (service types, each with its own resolved allowance per dimension), and
// can narrow (never widen) which rides count via ride_filter on top of a
// component's own ride_context.
export type RideFilter = 'all' | 'outdoor' | 'indoor'
export type CalendarUnit = 'day' | 'month' | 'year'
export type RequirementDimension = 'distance' | 'moving_time' | 'days'

// A requirement's own thresholds, raw -- the DB's actual nullable
// override/value columns (never "effective"). allowance_* fields are the
// satisfier's own override on top of whichever requirement owns it; nil on
// an allowance means "inherits this requirement's own threshold for that
// dimension" (see ServiceRequirementSatisfier#allowances_match_owner_thresholds).
export interface ServiceRequirementSatisfier {
  id: number
  service_type_id: number
  service_type_name: string
  position: number
  allowance_distance_meters: number | null
  allowance_moving_time_seconds: number | null
  allowance_calendar_amount: number | null
  allowance_calendar_unit: CalendarUnit | null
}

// A ComponentServiceRequirement's live-resolved view (inheritance +
// per-dimension satisfier allowances already applied) -- always read this
// for display/status, never resolve inheritance in the frontend itself.
export interface EffectiveServiceRequirement {
  name: string
  distance_meters: number | null
  moving_time_seconds: number | null
  calendar_amount: number | null
  calendar_unit: CalendarUnit | null
  ride_filter: RideFilter
  satisfiers: ServiceRequirementSatisfier[]
}

// A per-category suggested requirement template (e.g. "Chain lube" @
// 500km, hot-wax-or-drip-wax) -- user-managed on the Settings page,
// applied to a category's components as a linked ComponentServiceRequirement.
// Never itself inherits anything, so its own columns already are the
// "effective" values -- no separate resolved view needed.
export interface CategoryServiceRequirement {
  id: number
  user_id: number
  category: string
  name: string
  distance_meters: number | null
  moving_time_seconds: number | null
  calendar_amount: number | null
  calendar_unit: CalendarUnit | null
  ride_filter: RideFilter
  satisfiers: ServiceRequirementSatisfier[]
}

// What actually applies to one component -- either linked to a
// CategoryServiceRequirement template (category_service_requirement_id
// set; name/thresholds/ride_filter/satisfiers are null/empty here and
// inherited live through `effective`, with these columns available only as
// per-component overrides) or fully custom (category_service_requirement_id
// null, everything its own, satisfiers non-empty). A linked row's own
// `satisfiers` array is the TEMPLATE's raw satisfiers (for display/"edit
// the category default" linking) -- editing them goes through the
// template's own endpoint, never this row's.
export interface ComponentServiceRequirement {
  id: number
  component_id: number
  category_service_requirement_id: number | null
  name: string | null
  distance_meters: number | null
  moving_time_seconds: number | null
  calendar_amount: number | null
  calendar_unit: CalendarUnit | null
  ride_filter: RideFilter | null
  enabled: boolean
  satisfiers: ServiceRequirementSatisfier[]
  effective: EffectiveServiceRequirement
}

// {id, service_type_name, performed_at} for whichever MaintenanceEvent
// produced a requirement's current due point (the "setting event") on its
// driving dimension -- null in the synthetic-fallback case (no matching
// service logged yet). The same shape everywhere it appears (alerts,
// dashboard, component show) -- the backend never pre-formats this into a
// sentence; see DashboardDisplayMetric's own note on why.
export interface SettingEvent {
  id: number
  service_type_name: string
  performed_at: string
}

// The enriched shape GET /components/:id returns for each requirement --
// ComponentServiceRequirement's effective values plus the live-computed
// status across all three dimensions.
export interface ComponentServiceRequirementWithStatus {
  id: number
  category_service_requirement_id: number | null
  enabled: boolean
  requirement_name: string
  distance_meters: number | null
  moving_time_seconds: number | null
  calendar_amount: number | null
  calendar_unit: CalendarUnit | null
  ride_filter: RideFilter
  satisfiers: ServiceRequirementSatisfier[]
  status: ServiceStatus
  driving_dimension: RequirementDimension
  distance_used_meters: number | null
  distance_remaining_meters: number | null
  moving_time_used_seconds: number | null
  moving_time_remaining_seconds: number | null
  days_used: number | null
  days_remaining: number | null
  setting_event: SettingEvent | null
  // The raw meters/seconds/date setting_event produced on the driving
  // dimension -- unformatted (same meters-not-km convention as
  // everywhere else). 0 (or the component's baseline date) in the
  // synthetic-fallback case, matching setting_event: null.
  setting_position: number | string
}

// Singleton per user, GET/PATCH /notification_settings. id is null when the
// user has no row yet -- the response still carries the real hardcoded
// defaults (true/5), never a separate "missing" shape to special-case.
export interface NotificationSetting {
  id: number | null
  notifications_enabled: boolean
  warning_threshold_percent: number
}

// MaintenanceAlertBanners' required scope -- the Bike/Component detail
// pages are its only two renderers, each passing exactly one of these.
export type MaintenanceAlertScope = { bikeId: number } | { componentId: number }

// GET /maintenance_alerts -- banner-eligible (installed, not retired,
// notifications on, not currently dismissed) non-ok statuses, optionally
// scoped to one bike or one component (see MaintenanceAlertScope above).
// status is never 'ok' here (see ServiceStatus); only due/warning alerts
// are ever eligible for the banners. setting_position is the raw
// meters/seconds/date the setting_event produced on the driving dimension
// -- unformatted (same convention as everywhere else), currently unused by
// the banners but available for a future "last: drip wax at 2,140 km"
// treatment there.
export interface MaintenanceAlert {
  component_service_requirement_id: number
  component_id: number
  component_label: string
  category: string
  requirement_name: string
  status: 'warning' | 'due'
  distance_remaining_meters: number | null
  moving_time_remaining_seconds: number | null
  days_remaining: number | null
  setting_event: SettingEvent | null
  setting_position: number | string | null
  // Every bike the component is currently mounted on -- almost always one,
  // but a shared indoor_only component (see ComponentAssignment's
  // allows_multiple_assignments exception) can be mounted on two bikes at
  // once, and its alert belongs on both of their pages.
  bike_ids: number[]
}

// User-defined kind of maintenance (wax, sealant top-up, brake bleed, ...) --
// replaces the old hardcoded event_type enum, since this now drives real
// computation (service intervals) rather than being descriptive free text.
export interface ServiceType {
  id: number
  name: string
  // Component categories this type is tagged for. Empty = universal (every
  // category). Tags only filter pickers -- they never restrict what can be
  // logged.
  categories: string[]
  // Distinct requirements (templates + custom rows) this type satisfies.
  requirement_count: number
  event_count: number
}

export interface MaintenanceEvent {
  id: number
  component_id: number
  service_type_id: number
  performed_at: string
  notes: string | null
  // Set when this event was logged as part of a batch ServiceSession
  // (BatchServiceModal) rather than one at a time -- its own performed_at
  // can't be edited directly while this is set (see ServiceSession).
  service_session_id: number | null
}

// GET /maintenance_events (Maintenance::EventLog): one page of the
// Maintenance page's log. A session event's bike is its session's; a
// single event's is where its component was at performed_at (null: off
// the bike). Distances are meters at the event; since_last is null for the
// first service of its type on the component; resets names each enabled
// requirement on the component this service type satisfies.
export interface MaintenanceLogEvent extends MaintenanceEvent {
  created_at: string
  service_type: { id: number; name: string }
  component: { id: number; label: string; category: string }
  bike: { id: number; name: string } | null
  component_distance_at_event_meters: number
  since_last_same_type_meters: number | null
  bike_distance_at_event_meters: number | null
  resets: string[]
}

export interface MaintenanceLogSession {
  id: number
  performed_at: string
  bike: { id: number; name: string } | null
  notes: string | null
  // Every event in the session vs the ones the filters keep ("2 of 3").
  event_count: number
  matching_count: number
}

export interface MaintenanceLogBandTotals {
  services: number
  sessions: number
  components: number
}

export interface MaintenanceLogMeta {
  total: number
  // Under every filter but kinds: sessions (how many), single events.
  kind_counts: { session: number; single: number }
  // Unfiltered; "this year" in the viewer's zone.
  tiles: {
    services_this_year: number
    sessions_this_year: number
    last_service_at: string | null
    most_serviced: { component_id: number; label: string; count: number } | null
  }
  // Keyed "2026-11" (local month), for the months on this page.
  month_totals: Record<string, MaintenanceLogBandTotals>
  // Keyed by component id, for the components on this page.
  component_totals: Record<string, number>
}

export interface MaintenanceLogResponse {
  events: MaintenanceLogEvent[]
  sessions: Record<string, MaintenanceLogSession>
  meta: MaintenanceLogMeta
  next_cursor: string | null
}

// A session's service as GET /service_sessions/:id returns it -- the same
// enriched fields the Maintenance page's log has (Maintenance::EventLog).
export interface ServiceSessionEvent {
  id: number
  component_id: number
  service_type_id: number
  performed_at: string
  notes: string | null
  service_type: { id: number; name: string }
  component: { id: number; label: string; category: string }
  component_distance_at_event_meters: number
  since_last_same_type_meters: number | null
  resets: string[]
}

// GET /service_sessions/:id: the session, its bike's odometer and last
// ride at performed_at (null when never ridden before), and its services,
// oldest first.
export interface ServiceSession {
  id: number
  bike_id: number
  bike: { id: number; name: string }
  performed_at: string
  notes: string | null
  created_at: string
  updated_at: string
  bike_distance_at_meters: number
  last_ride_before: { name: string; distance_meters: number; moved_at: string } | null
  events: ServiceSessionEvent[]
}

// One row of GET /bikes/:id/serviceable_components -- shared by the batch
// logger's component picker and nothing else. status/driving_dimension/
// *_remaining are computed as of now (not the `at` the request was made
// for) -- they're there to help the user choose, not a record of what the
// requirement looked like at that point in time. satisfiers is the
// requirement's live-resolved satisfier list (service_type id+name+
// position+resolved allowances), so BatchServiceModal can group one row
// per service type across every component's requirements without a
// second request.
export interface ServiceableComponentRequirement {
  id: number
  requirement_name: string
  satisfiers: ServiceRequirementSatisfier[]
  status: ServiceStatus
  driving_dimension: RequirementDimension
  distance_remaining_meters: number | null
  moving_time_remaining_seconds: number | null
  days_remaining: number | null
  setting_event: SettingEvent | null
}

export interface ServiceableComponent {
  id: number
  label: string
  category: string
  service_requirements: ServiceableComponentRequirement[]
}

export interface ServiceableComponentsResponse {
  mounted: ServiceableComponent[]
  off_bike: ServiceableComponent[]
}

export type SyncFailureCode = 'rate_limited' | 'strava_unavailable' | 'auth_failed' | 'unknown'

export interface StravaStatus {
  connected: boolean
  athlete_id: number | null
  last_synced_at: string | null
  last_full_sync_at: string | null
  // null when a full refresh can be triggered right now; otherwise the
  // time it becomes available (see StravaCredential#full_sync_available_at).
  full_sync_available_at: string | null
  // Roughly how many Strava API calls a full refresh would cost right now
  // (see StravaCredential#full_sync_request_estimate) -- the Rides tab uses
  // this, alongside max_bulk_resync, to decide whether to offer "Resync
  // selected" or route a large selection to a full refresh instead.
  full_sync_request_estimate: number | null
  max_bulk_resync: number
  last_sync_failed_at: string | null
  last_sync_error: SyncFailureCode | null
  last_sync_failed_kind: 'full' | 'incremental' | null
  last_sync_retry_at: string | null
  // Either kind of sync started and not yet finished (within the backend's
  // RUNNING_TIMEOUT). useSyncCompletionWatcher polls while this is true.
  sync_in_progress: boolean
}

interface StravaGearRow {
  gear_id: string
  name: string | null
  brand_name: string | null
  model_name: string | null
  retired: boolean
  activity_count: number
  distance_meters: number
  last_activity_on: string | null
}

export interface StravaGear extends StravaGearRow {
  // true only for a row that's still ignored but has a new activity since
  // ignored_at -- it shows in /strava/unmapped_gear again instead of
  // /strava/ignored_gear, flagged so the UI can call that out.
  resurfaced: boolean
}

export interface StravaIgnoredGear extends StravaGearRow {
  ignored_at: string
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

// GET /dashboard -- assembled entirely from existing services (see
// Dashboard::Summary); nothing here is computed freshly for this endpoint.
export interface DashboardSyncBucket {
  count: number
  distance_meters: number
}

export interface DashboardSyncSection {
  connected: boolean
  last_synced_at: string | null
  rides_total: number
  // From the credential, so the header's failure state survives a
  // reload -- useStravaSyncRunner's own `failure` is live-poll-only and
  // resets on mount. No last_sync_failed_kind here: the strip shows one
  // generic failure line regardless of full vs incremental.
  last_sync_failed_at: string | null
  last_sync_error: SyncFailureCode | null
  last_sync_retry_at: string | null
  unattributed: {
    count: number
    distance_meters: number
    // Fixable via gear mapping (Strava has a gear id, just not mapped to a bike yet).
    with_gear: DashboardSyncBucket
    // Not fixable here -- Strava itself had no bike set on the ride.
    without_gear: DashboardSyncBucket
    unmapped_gear_count: number
  }
}

// Meters/seconds/days only, same as everywhere else in the app (the API
// always returns meters, the UI always converts via formatDistance) --
// requirement_name: null means "no enabled requirement," so distance_meters
// is just the component's plain lifetime total, not a since-service figure.
// since_service_type_name is specifically the setting event's own service
// type -- with multiple satisfiers this can differ from requirement_name
// (e.g. "Chain lube" cleared by a drip wax), so "N km since X" needs its
// own field rather than reusing the requirement's name.
export interface DashboardDisplayMetric {
  requirement_name: string | null
  distance_meters: number | null
  moving_time_seconds: number | null
  days: number | null
  since_service_type_name: string | null
}

export type DashboardMountedComponent = {
  component_id: number
  // The active assignment this mounted row represents -- needed by the
  // one-step swap action (POST /component_assignments/:id/swap), which
  // this row's own "Swap" tap target uses.
  assignment_id: number
  label: string
  category: string
  ride_context: 'both' | 'outdoor_only' | 'indoor_only'
  service_status: ServiceStatus | null
  display_metric: DashboardDisplayMetric
} & DashboardWearFields

export type DashboardOffBikeComponent = {
  component_id: number
  label: string
  category: string
  // The category's ComponentCategorySetting#rotates -- only a rotating
  // category gets a rotation strip; otherwise it's the plain off-bike line.
  rotates: boolean
  // Its worst status and when its clock was last reset (the setting
  // event), for the bike page's rotation card ("waxed Nov 20, ready").
  service_status: ServiceStatus | null
  last_service_at: string | null
  display_metric: DashboardDisplayMetric
} & DashboardWearFields

// The driving requirement's progress (all null with no enabled
// requirement), plus lifetime distance -- set only for components in a
// same-category rotation pair on the bike (a rotating category), null
// otherwise.
export interface DashboardWearFields {
  fraction_used: number | null
  driving_dimension: RequirementDimension | null
  distance_remaining_meters: number | null
  moving_time_remaining_seconds: number | null
  days_remaining: number | null
  total_distance_meters: number | null
}

export interface DashboardBike {
  id: number
  name: string
  total_distance: number
  ride_count: number
  last_ride_on: string | null
  // Strava sport type of the latest ride, e.g. "GravelRide" (formatSportType).
  last_ride_activity_type: string | null
  distance_this_month: number
  mounted: DashboardMountedComponent[]
  off_bike: DashboardOffBikeComponent[]
}

// Broader than the alert banners (MaintenanceAlert) -- every non-ok,
// non-retired requirement, including ones a banner would hide (dismissed,
// notifications off, not currently mounted). Those three are flags here
// instead of exclusions, so the dashboard can label rather than hide them.
// One requirement's status, the shape shared by attention (warning/due)
// and upcoming (ok rows on mounted components, nearest to due first).
export interface DashboardRequirementItem {
  component_id: number
  component_label: string
  requirement_id: number
  requirement_name: string
  // Resolved satisfiers (service_type id+name+position+allowance), same
  // shape as everywhere else -- position 1 is "Log service"'s default
  // service type, same convention as ComponentDetail's own split button.
  satisfiers: ServiceRequirementSatisfier[]
  status: ServiceStatus
  driving_dimension: RequirementDimension
  distance_used_meters: number | null
  effective_distance_meters: number | null
  moving_time_used_seconds: number | null
  effective_moving_time_seconds: number | null
  days_used: number | null
  effective_calendar_amount: number | null
  effective_calendar_unit: CalendarUnit | null
  distance_remaining_meters: number | null
  moving_time_remaining_seconds: number | null
  days_remaining: number | null
  fraction_used: number
  setting_event: SettingEvent | null
  dismissed: boolean
  notifications_off: boolean
  mounted: boolean
  // The bike it's currently mounted on, or null if unmounted. A component
  // can rarely be mounted on more than one bike at once (the documented
  // shared indoor_only-cassette case) -- this is the first one, a
  // deliberate display simplification.
  bike: { id: number; name: string } | null
}

export type DashboardAttentionItem = DashboardRequirementItem & { status: 'warning' | 'due' }

export interface DashboardRecentRide {
  id: number
  moved_at: string
  // Seconds; null when Strava omitted it. Used to prefill "Log service after
  // this ride" at the ride's end.
  elapsed_time: number | null
  name: string
  // Strava's sport_type, e.g. "GravelRide" (formatSportType).
  activity_type: string | null
  distance_meters: number
  // Seconds; null for rows synced before the column existed.
  moving_time: number | null
  bike: { id: number; name: string } | null
  // Present alongside a null bike only when the ride is fixable via gear
  // mapping (same distinction as sync.unattributed.with_gear) -- null here
  // means Strava itself had no bike set, not just an unmapped one.
  gear_id: string | null
  indoor: boolean
}

export interface DashboardSummary {
  sync: DashboardSyncSection
  bikes: DashboardBike[]
  attention: DashboardAttentionItem[]
  upcoming: DashboardRequirementItem[]
  // The five newest rides, newest first.
  recent_rides: DashboardRecentRide[]
  // The five newest service entries from Activity::Feed, in its own entry
  // shape: sessions, session-less events, and swaps (merged "replaced"
  // setup changes) -- never plain installs/removals.
  recent_service: (ActivityServiceSessionItem | ActivityMaintenanceEventItem | ActivitySetupChangeItem)[]
  stats: DashboardStats
}

// Riding totals for the summary tiles, in the viewer's tz (every synced ride
// except individually ignored ones). Dates are local 'YYYY-MM-DD'.
export interface DashboardStatsTotals {
  start_date: string
  distance_meters: number
  moving_time_seconds: number
  elevation_gain_meters: number
  ride_count: number
}

export interface DashboardStats {
  today: string
  // Monday-start; daily is always seven entries, Mon..Sun, zero-filled.
  week: DashboardStatsTotals & { daily: { date: string; distance_meters: number }[] }
  month: DashboardStatsTotals
  year_to_date: {
    distance_meters: number
    // Jan 1 last year to the same local date and time (Feb 29 -> Feb 28).
    last_year_to_date_distance_meters: number
    last_year_total_distance_meters: number
  }
}

// One row of GET /bikes/:id/rides -- the Ride history table. Every
// analytics field below is nullable and never coerced to 0 (Strava omits
// them entirely when the activity has no matching sensor). ride_kind is
// server-derived (StravaActivity#ride_kind) so the frontend never
// re-implements the indoor/trainer/virtual rule itself.
export interface BikeRide {
  id: number
  strava_id: number
  name: string
  moved_at: string
  activity_type: string
  ride_kind: 'outdoor' | 'trainer' | 'virtual'
  commute: boolean
  distance_meters: number
  // The bike's full odometer through and including this ride, in
  // chronological order -- independent of the active type filter or which
  // page this ride is on (see Bikes::RideHistory).
  cumulative_distance_meters: number
  moving_time: number | null
  elapsed_time: number | null
  total_elevation_gain: number | null
  average_speed: number | null
  max_speed: number | null
  average_watts: number | null
  weighted_average_watts: number | null
  device_watts: boolean | null
  kilojoules: number | null
  average_heartrate: number | null
  max_heartrate: number | null
  average_cadence: number | null
  // The components this ride adds distance to -- shown as the "Components"
  // column. The API key keeps its original name so saved column
  // preferences and existing payloads don't change.
  counted_toward: { component_id: number; label: string }[]
}

export type RideAttribution = 'attributed' | 'needs_attention' | 'ignored'
export type RideAttentionReason = 'unmapped_gear' | 'no_gear' | 'ride' | 'gear'

// One row of GET /strava/rides -- the Rides tab, across every bike. Same
// shape as BikeRide minus cumulative_distance_meters (an odometer only
// makes sense for one bike), plus the attribution/gear/bike fields that
// only matter once rides aren't all implicitly "this bike's."
export interface StravaRide extends Omit<BikeRide, 'cumulative_distance_meters'> {
  bike: { id: number; name: string } | null
  gear: { strava_gear_id: string; name: string | null } | null
  attribution: RideAttribution
  reason: RideAttentionReason | null
  ignored_at: string | null
}

export interface StravaRidesResponse {
  rides: StravaRide[]
  meta: {
    total_count: number
    total_distance_meters: number
    page: number
    per_page: number
    next_page: number | null
    status_counts: { attention: number; ignored: number; all: number }
  }
}

// GET /activity -- a bike's rides, service, and setup changes on one
// timeline (Activity::Feed). Three UI-facing kinds (?kinds[]=); 'service'
// covers both service_session and maintenance_event entries, which the
// backend's kind_rank treats as the same tie-break bucket.
export type ActivityUiKind = 'ride' | 'service' | 'setup'

// Same ride fields as StravaRide, minus gear/ignored_at (nothing here is
// Strava-gear-mapping-specific -- this page links to Strava itself, or to
// the Rides tab, for that), plus kind/occurred_at for the merged timeline.
export interface ActivityRideItem extends Omit<StravaRide, 'gear' | 'ignored_at'> {
  kind: 'ride'
  occurred_at: string
}

export interface ActivityServiceSessionItem {
  kind: 'service_session'
  id: number
  occurred_at: string
  bike: { id: number; name: string } | null
  notes: string | null
  item_count: number
  items: { component_id: number; label: string; service_type_name: string; note: string | null }[]
  summary: string
}

export interface ActivityMaintenanceEventItem {
  kind: 'maintenance_event'
  id: number
  occurred_at: string
  bike: { id: number; name: string } | null
  component_id: number
  label: string
  service_type_name: string
  note: string | null
  summary: string
}

export interface ActivitySetupChangeItem {
  kind: 'setup_change'
  id: number
  occurred_at: string
  bike: { id: number; name: string } | null
  action: 'installed' | 'removed' | 'replaced'
  component: { id: number; label: string }
  // Only set when action is 'replaced' (the removed side of a merged swap).
  replaced_component: { id: number; label: string } | null
  // null for the default ('both') -- see Activity::Feed#setup_change_item.
  ride_context: 'outdoor_only' | 'indoor_only' | null
  summary: string
}

export type ActivityItem =
  | ActivityRideItem
  | ActivityServiceSessionItem
  | ActivityMaintenanceEventItem
  | ActivitySetupChangeItem

export interface ActivityWeekTotals {
  ride_count: number | null
  distance_meters: number | null
  moving_time: number | null
  total_elevation_gain: number | null
  service_count: number | null
  setup_count: number | null
}

export interface ActivityFeedResponse {
  items: ActivityItem[]
  meta: {
    // Independent of the active kinds[] selection -- always reflects the
    // bike/date/q/component filters alone, so the header stat and chip
    // counts stay meaningful regardless of which chips are toggled.
    ride_totals: { count: number; distance_meters: number; moving_time: number; total_elevation_gain: number }
    kind_counts: { ride: number; service: number; setup: number }
    // Date order only: whole-week totals for each local Monday-start week
    // this page touches (null for a kind that isn't selected).
    week_totals?: Record<string, ActivityWeekTotals>
  }
  // True when a metric sort narrowed the list to rides.
  rides_only: boolean
  // Opaque: a keyset cursor for sort=date, or a page number for
  // sort=distance -- the frontend never parses it, just echoes it back.
  next_cursor: string | null
}

// GET /strava/rides/:id -- one ride for RideDetailModal. Every metric is
// null when Strava didn't record it (distance_meters is never null).
export interface RideDetailComponent {
  component_id: number
  label: string
  category: string
  service_status: ServiceStatus | null
  fraction_used: number | null
  driving_dimension: RequirementDimension | null
  distance_remaining_meters: number | null
  moving_time_remaining_seconds: number | null
  days_remaining: number | null
  // Lifetime distance -- set only when there's no enabled requirement.
  total_distance_meters: number | null
}

export interface RideDetail {
  id: number
  strava_id: number
  name: string
  moved_at: string
  activity_type: string | null
  ride_kind: 'outdoor' | 'trainer' | 'virtual'
  indoor: boolean
  trainer: boolean
  commute: boolean
  bike: { id: number; name: string } | null
  gear_id: string | null
  gear_mapped: boolean
  reason: 'unmapped_gear' | 'no_gear' | 'gear' | 'ride' | null
  distance_meters: number
  moving_time: number | null
  elapsed_time: number | null
  total_elevation_gain: number | null
  average_speed: number | null
  max_speed: number | null
  average_watts: number | null
  weighted_average_watts: number | null
  device_watts: boolean | null
  kilojoules: number | null
  average_heartrate: number | null
  max_heartrate: number | null
  average_cadence: number | null
  components: RideDetailComponent[]
}
