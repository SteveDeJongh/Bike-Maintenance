# Service requirements, alerts, and batch service logging

> Reference material split out of CLAUDE.md. A quoted cross-reference such as "see \"Strava integration\"" names a `##` section heading; CLAUDE.md's "Further docs" list says which docs/ file holds each heading.

## Service intervals and maintenance alerts

User-defined "this comes due every N km / N hours / N months, cleared by one or
more service types" tracking. Recording a service means creating
a `MaintenanceEvent` of that type — nothing is stored as a counter, progress is
always computed from event history, same as `Component#distance_since` above. See
the `ServiceType`/`CategoryServiceRequirement`/`ComponentServiceRequirement`/
`ServiceRequirementSatisfier`/`NotificationSetting`/`ServiceAlertDismissal` bullets
above for the data model; this section covers how status gets computed and
surfaced. The requirement/satisfier model exists to support alternative services that
clear the same requirement at different allowances (a 500 km hot wax or a 250 km
drip wax both satisfy "Chain lube"), a service that also clears a smaller one (a
200 h fork service resets a 50 h one too), calendar/moving-time dimensions, and
ride-filtered counting.

- **The due-point algorithm** (`Maintenance::RequirementStatus#call`) computes
  status independently per **active dimension** (distance/moving_time/calendar —
  whichever of a requirement's effective thresholds are actually set; more than one
  can be active at once, e.g. "50 hours or 1 year"). For each dimension, the
  **candidates** are every `MaintenanceEvent` on the component whose service type
  is one of the requirement's effective satisfiers, plus one **synthetic fallback
  point** at position 0 (dated at the component's baseline — its first
  assignment's `started_at`, else `acquired_on`) whose implicit allowance is the
  dimension's own effective threshold — this is what makes "no satisfying event
  yet" fall out of the *same* formula with no special case: due = 0 + threshold,
  i.e. today's plain fraction. The **due point** is the `MAX`, over every
  candidate, of `(that candidate's position on this dimension) + (that candidate's
  own resolved allowance for this dimension)` — because it's a max, an
  earlier/shorter service (a drip wax logged shortly after a hot wax) can never
  pull the due point earlier; a later, real service that legitimately buys further
  out still moves it forward, even past an earlier candidate's own due point. The
  **setting event** is whichever candidate produced that max (`nil` for the
  synthetic point — "no real service logged yet"); ties prefer the later one.
  Position, for distance/moving_time, is cumulative ride-filtered (the component's
  own `ride_context` ∩ the requirement's `ride_filter`) distance/moving_time up to
  and including that candidate's timestamp; for calendar, it's just the
  candidate's own date, and its due point is `date.advance(unit => amount)` using
  **that specific candidate's own** resolved calendar allowance (which can differ
  in unit from the requirement's own stated one — e.g. a satisfier that only buys
  6 months toward a 1-year requirement) — `Date#advance` handles mixed units and
  end-of-month clamping for free (Jan 31 + 1 month → Feb 28/29), confirmed standard
  Ruby/Rails behavior, not something this app implements. `driving_dimension` is
  whichever active dimension has the highest fraction-used (ties broken distance >
  moving_time > calendar, arbitrary but fixed); `status` is the worst of
  due/warning/ok across *every* active dimension, same `warning_threshold_percent`
  rule as before, generalized from two dimensions to three.
- `Maintenance::BatchedPositionQuery.call(user)` batches the distance/moving-time
  position lookups above across a whole user's requirements in one SQL pass (the
  calendar dimension needs no SQL — it's plain `Date` arithmetic over timestamps
  already in hand). Two phases: (1) in Ruby, from one cheap
  `MaintenanceEvent.group(:component_id, :service_type_id).maximum(:performed_at)`
  aggregate, find each requirement's **bounding cutoff** — any candidate event
  strictly before the most recent occurrence of the satisfier with the *largest*
  resolved allowance on a given dimension is provably dominated (its own due point
  can never exceed that satisfier's) and excluded entirely, so only a handful of
  recent events (usually one long-lived service plus a few short-lived ones since)
  ever need a real position computed; a requirement with two active numeric
  dimensions uses one shared, more conservative cutoff (the earlier of the two)
  rather than two independent ones. (2) One SQL pass over exactly the remaining
  checkpoints — a small Ruby-built `VALUES` list of `(requirement, checkpoint_at)`
  pairs (every bounded-in candidate event, plus "now") — joined to
  `component_assignments ⨝ strava_activities` the same windowed way every other
  batched query in this codebase already does, intersected with **both**
  `Maintenance::RideContextSql.predicate` (the assignment's own `ride_context`) and
  the new `Maintenance::RideFilterSql.predicate` (the requirement's `ride_filter`,
  reusing `RideContextSql`'s own indoor/outdoor predicates rather than redefining
  the indoor rule a second time) — an `AND`, which is what makes `ride_filter`
  narrow what `ride_context` already admits and never widen it, by construction.
  `.for_component(component)` (the component detail page) and `.for_user(user)`
  (everything else: banners, Dashboard, table columns) both go through
  `BatchedPositionQuery` — one implementation, not two separate per-component vs.
  per-user code paths that could drift apart; `.for_component` just calls it scoped
  to the component's own user and filters the result down to that one component's
  requirements afterward. `.worst_status_by_component(user)`/
  `.worst_result_by_component(user)` reduce `.for_user`'s results to one
  status/`Result` per component (due > warning > ok) for the `service_status` table
  column and the Dashboard's own per-component display. A component with no
  enabled requirement has no entry — rendered as a dash, not an `ok` badge.
- `strava_activities.moving_time` is nullable with no backfill for rows synced
  before it was added (`20261015223545_add_analytics_fields_to_strava_activities`)
  — `SUM()` already silently skips nulls, matching every other `moving_time`
  consumer in this app, but a moving-time requirement under-counts historical
  rides until the user runs a full Strava refresh (see "Strava integration" below)
  to backfill it; not fixed as part of this feature.
- Banner eligibility (`Result#banner_eligible?`) is stricter than just "not ok": the
  component must be currently installed (an assignment with `ended_at: nil`), not
  retired, have notifications enabled for its category
  (`NotificationSetting.effective_for`), and not be currently suppressed by a
  `ServiceAlertDismissal`. Ineligible requirements still compute and show a real
  status everywhere else (component page, table columns) — eligibility only gates
  the banners.
- API: `ServiceTypesController`, `CategoryServiceRequirementsController` (plus
  `POST .../:id/apply`), `ComponentServiceRequirementsController` (plus `POST
  .../apply_defaults`), `ServiceRequirementSatisfiersController` (nested under
  either owner for `#create`/`#reorder` — `PATCH .../satisfiers/reorder` takes the
  owner's complete, reordered satisfier id list or the whole request is rejected —
  flat `/service_requirement_satisfiers/:id` for `#update`/`#destroy`; a create or
  reorder against a **linked** `ComponentServiceRequirement` is rejected outright:
  "Linked requirements use their template's satisfiers — edit the category default
  instead"), `NotificationSettingsController` (singleton, upsert like
  `TableViewPreference`), `MaintenanceAlertsController#index` (`GET
  /maintenance_alerts`, banner-eligible statuses only), `ServiceAlertDismissalsController`
  (`#create`, `#dismiss_all` with an optional `status` param). Both the index and
  `dismiss_all` take optional `bike_id`/`component_id` filters, applied *after*
  banner-eligibility, via the one shared
  `Maintenance::RequirementStatus.banner_eligible_for_user(user, bike_id:, component_id:)`
  — so a scoped banner's "dismiss all" can never touch anything the matching index
  call didn't itself show. Unscoped (every alert at once) still works for backwards
  compatibility, but the frontend never calls either endpoint that way now — see
  below. Every alert also carries `requirement_name`, `setting_event`
  (`{id, service_type_name, performed_at} | nil`) and a raw, unformatted
  `setting_position` (meters/seconds/a date string, matching `driving_dimension` —
  the backend never pre-formats this into a sentence, same API-returns-raw-values
  convention as everywhere else) alongside `bike_ids`: every bike the component
  currently has an active (`ended_at: nil`) assignment on — usually one, but a
  category with `allows_multiple_assignments` can have the same component mounted
  `indoor_only` on two bikes at once, and that alert belongs on both bikes' pages,
  unfiltered by whichever `bike_id` the request happened to scope to.
  `ComponentsController#show` includes every enabled-or-not requirement's full
  computed status (`service_requirements`, including its resolved `satisfiers` and
  `setting_event`/`setting_position`); `ComponentsController#index` and
  `BikesController#show` (per installed component) include just the batched
  `service_status` summary.
- Frontend: `MaintenanceAlertBanners` takes a required `scope` prop
  (`{ bikeId } | { componentId }`, `types/models.ts`'
  `MaintenanceAlertScope`) and renders on `BikeDetail`/`ComponentDetail` only, just
  below the page title — not in `Layout.tsx`, which doesn't render it at all. The
  Dashboard's "Needs attention" panel (see "Dashboard" below) is the app-wide
  overview; these two banners are the equivalent, scoped detail. A red "due" list
  and a collapsed-by-default yellow "warning" count, each item linking to its
  component with a "dismiss until next sync" control, each banner with its own
  "dismiss all" (scoped to both that banner's own status *and* the page's
  `bikeId`/`componentId`, via `useDismissAllServiceAlerts(scope)` — so dismissing
  the due banner on one bike never also clears warnings, or another bike's alerts).
  No modals/toasts. On `ComponentDetail` (where the component is already named by
  the page) each item reads just `"{requirement name} — {status}"` rather than
  repeating the component label, and the banner title counts services rather than
  components, since every item there is already the one known component; on
  `BikeDetail` both stay `"{component label} — {requirement name}"` and the
  components-count title, unchanged from before this scoping existed.
- **Settings → Component Categories**: `CategoryServiceRequirementsModal.tsx` (one
  template per row — name; three threshold inputs, km/hours/calendar amount+unit,
  each independently clearable, ≥1 required; a `SegmentedControl` for
  `ride_filter` with a dimmed "Calendar time keeps counting on indoor rides" note
  next to the calendar field whenever the filter isn't "all"; an ordered
  "Satisfied by" list — `SatisfiersEditor`/`SatisfierRow`, a service-type picker
  with inline create plus per-dimension allowance override inputs only shown for a
  dimension the requirement actually has, each with a "same as requirement"
  placeholder when unset, reorder via up/down `ActionIcon`s wired straight to
  `PATCH .../satisfiers/reorder`, remove disabled on the last satisfier; the
  apply-to-components checklist, deduped by "already linked to this template," not
  by service type) . A brand-new template's satisfiers are collected
  locally as drafts (`DraftSatisfierRow`) and submitted together with the template
  in one transactional create call, so "at least one satisfier" is never left with
  a gap. These pieces (`SatisfiersEditor`/`SatisfierRow`/`DraftSatisfierRow`, the
  unit conversion helpers, the `CALENDAR_UNIT_OPTIONS`/`RIDE_FILTER_OPTIONS`
  constants) live in `frontend/src/components/forms/serviceRequirementHelpers.ts`
  (plain functions/constants) and `serviceRequirementShared.tsx` (components —
  split into two files only so the JSX one satisfies react-refresh's
  "components-only export" rule) and are reused as-is by `ComponentDetail`'s own
  custom-requirement editor below — "Custom requirements edit satisfiers inline
  with the same editor as Settings" is implemented literally as shared code, not a
  second copy.
- **ComponentDetail → Service requirements**
  (`frontend/src/components/ServiceIntervalsSection.tsx`, rendered by
  `ComponentServiceAndHistory.tsx`, shared by the standalone `ComponentDetail` page
  and `BikeDetail`'s `AssignmentDetailModal`): one row per requirement (enabled or
  not, so its Switch can be flipped back on in place) — name + a dimmed secondary
  line (every satisfier's service type name joined with "or", a `· last: {setting
  event's service type} at {formatted setting_position}` clause once a real
  service has been logged — omitted, not shown blank, in the synthetic-fallback
  case — and a `· outdoor/indoor rides only` note when `ride_filter` narrows
  counting), a progress bar on the driving dimension, a "Default"/"Custom" marker,
  remaining/overdue text across every *active* dimension at once (`formatRemaining`
  in `utils/serviceInterval.ts`, with an optional third, moving-time argument — a requirement can now have more than one dimension counting
  down simultaneously, e.g. "50h or 1 year"), a
  status badge, an enable `Switch`, and Remove. "Log service" is a **split
  button**: the primary action logs the requirement's position-1 satisfier; a
  dropdown (hidden entirely for a single-satisfier requirement — nothing to pick)
  lists the rest. Before opening `MaintenanceEventFormModal`, it checks whether
  the chosen service type also clears any **other** requirement on the same
  component (the same satisfier service type appearing in more than one
  requirement's list) and, if so, confirms first ("This also clears: Fork 50h")
  via a non-destructive `modals.openConfirmModal` — skipped entirely when there's
  nothing else to name, so a plain single-requirement log stays the one-click
  action it always was. A **linked** row's overrides (three thresholds +
  `ride_filter`, "Reset to default" nulling all of them at once) go through
  `EditServiceIntervalModal`, showing the template's own effective values as
  context . A **custom** row expands inline instead (an "Edit"/"Done"
  toggle, mirroring the Settings template editor's own `editing` state) into its
  own name/threshold/ride-filter fields plus the shared `SatisfiersEditor` — fed
  the **raw** satisfiers from `GET /component_service_requirements?component_id=`
  (not the already-resolved ones on `GET /components/:id`'s payload), specifically
  so an unset allowance shows its "same as requirement" placeholder instead of a
  resolved number that would look like someone had typed it in. "+ Add custom
  requirement" (`AddCustomServiceIntervalModal.tsx`) mirrors the Settings "new
  template" flow — name/thresholds/ride_filter/draft satisfiers collected locally,
  submitted together in one transactional create. "+ Add from category defaults" is deduped by linked template, not by service type.
  `ServiceStatusBadge`/`SERVICE_STATUS_COLORS`/`SERVICE_STATUS_SEVERITY` back the
  `service_status` column on the Components list and Bike detail's Installed
  Components table (through the existing configurable-table system), and the
  Service requirements table's own Status column too.
- **`BatchServiceModal`** (see "Batch service logging" below): rows are one per
  service type across a component's requirements, not one per requirement — see
  that section for the full redesign.

**Known limitation**: sync is still manual (see "Strava integration" below) — until
a scheduler is deployed, a dismissed alert stays hidden only until the user next
presses "Sync now". Calendar-based requirements keep advancing regardless of sync
(calendar position is a plain date calculation), but a dismissal only lifts on a
completed sync or on escalation to a worse status.

## Batch service logging

Maintenance usually happens in a session — wax the chain, top up sealant, clean
the cassette, all on the same Saturday — but logging one service at a time
through a component page has no way to record that several were done together.
See the `MaintenanceEvent`/`ServiceSession` data model bullets above for the
event/session rules themselves; this section covers how "what's serviceable on
this bike" gets computed and how the batch logger itself works.

- **`Bikes::ServiceableComponents.call(bike, at: Time.current)`**
  (`app/services/bikes/serviceable_components.rb`) answers "what could a
  service session on this bike cover, as of `at`?" — not just "now." Returns a
  `Result` with two groups: `mounted` (an assignment on this bike with
  `started_at <= at` and `ended_at` either `nil` or after `at`) and `off_bike`
  (non-retired-as-of-`at` components with no active assignment *anywhere* at
  `at`, whose most recent assignment ending at-or-before `at` was on *this*
  bike — a component currently mounted on a *different* bike at `at` is
  excluded from both groups here, correctly: it's neither mounted on this bike
  nor off it, it's just elsewhere). Backdating to a date before a component
  swap returns what was actually mounted *then*, not today's lineup. One
  shared implementation, not two: the batch logger's own component picker
  (`GET /bikes/:id/serviceable_components`) and `ServiceSessionsController`'s
  create/update eligibility checks all go through this, so the picker and the
  validation can never disagree about what's offered vs. accepted.
- **`.off_bike_components_by_bike(user, at: Time.current)`** is the
  class-level, whole-user, grouped-by-bike version of the same off-bike
  computation — `Dashboard::Summary#off_bike_components_by_bike` is a one-line delegate to this at its default `at:`. A component retired on the same calendar
  day as `at` still excludes correctly (compares `retired_on` cast to a
  timestamp against `at`, not a bare date, specifically so a same-day
  retirement reads as "before" any later moment that day)
- **`GET /bikes/:id/serviceable_components?at=<iso8601>`** (`BikesController`,
  same home as the existing `:rides` member action) returns `{ mounted: [...],
  off_bike: [...] }`, each component with its **enabled** service requirements
  (`Maintenance::RequirementStatus.for_user`, batched once per request — never
  per component) carrying `requirement_name`, its resolved `satisfiers`
  (service_type id+name+position+allowance — the whole list, not just position 1,
  so `BatchServiceModal` can group by service type across every component's
  requirements without a second request), `status`, `driving_dimension`,
  `distance_remaining_meters`/`moving_time_remaining_seconds`/`days_remaining`, and
  `setting_event`. That status is computed **as of now**, never as of `at` — it
  exists to help the user decide what to check, not to claim what the requirement
  looked like on a backdated date, and the UI copy says so.
- **`POST /bikes/:id/service_sessions`** (`ServiceSessionsController#create`)
  takes a flat `{ performed_at, notes?, events: [{ component_id,
  service_type_id, notes? }, ...] }` (same shape convention as
  `#component_setup`'s `{ installed_on, components: [...] }`, not nested under
  a `service_session:` key) and creates the session plus every event in one
  transaction. At least one event is required; a duplicate `(component_id,
  service_type_id)` pair within the same request, an ineligible
  `component_id` (checked against `Bikes::ServiceableComponents` at the
  session's own `performed_at`), or an unknown `service_type_id` all reject
  the *whole* request with `422 { row_errors: { "<index>": {...} } }` — same
  key name and per-index shape as `#component_setup`'s own. A `service_type_id`
  needs no requirement set up on that component (the "Add other" path on a
  service with nothing tracked yet). `GET`/`PATCH`/`DELETE
  /service_sessions/:id` round it out; `PATCH`ing `performed_at` re-checks
  every existing event's component against `Bikes::ServiceableComponents` at
  the *new* time first, naming whichever would stop qualifying instead of
  saving anything.
- **`BatchServiceModal`** (`frontend/src/components/forms/BatchServiceModal.tsx`)
  is the frontend: a date/time picker up top (refetching
  `serviceable_components` on every change — whatever's still checked after a
  refetch stays checked, the rest silently drop with a one-line dimmed note of
  how many), components grouped mounted-first then a dimmed "Off the bike"
  group. Rows are **one per (component, service type)** that satisfies at least
  one of that component's enabled requirements — not one per requirement — so a
  service type satisfying two requirements at once (a 200 h service that also
  clears a 50 h one) shows as a single checkbox that logs one event and clears
  both, the same convention `ComponentDetail`'s own split "Log service" button
  uses. Each row names every requirement it clears, each with its own status
  ("Drip Wax · clears Chain lube (due), Chain re-wax (ok)"), and the row's own
  `ServiceStatusBadge` is the worst status across them (`SERVICE_STATUS_SEVERITY`).
  "Select all due and warning" picks, per non-ok requirement, its position-1
  satisfier — deduped by `(component, service type)` key, so two due requirements
  on the same component that share a satisfier only ever add one row. "Add
  other…" rows (a component picker from the same eligible list plus
  `ServiceTypeSelect`/`useServiceTypeIdResolver`, the exact pieces
  `MaintenanceEventFormModal` already uses) are unchanged — they were always
  service-type-first, with no requirement concept to group by. Rows show no remaining-distance text (a row can clear several requirements with different remaining amounts, and the "clears X (status)" list already says what matters) — `ComponentDetail`'s own rows do. Takes an optional
  `initialPerformedAt` prop — unused by `BikeDetail`'s header "Log service"
  button and the Dashboard `BikeCard`'s own "Log service" action, but used by the shared "Log service after this ride" per-ride action
  (`LogServiceAfterRideButton`, on every ride list — see "Ride history"), which
  passes a ride's `moved_at + elapsed_time`. Mutations
  (`useCreateServiceSession`/`useUpdateServiceSession`/`useDeleteServiceSession`)
  invalidate the `history` and `serviceStatus` groups, same as single-event
  "Log service" (see "Cache invalidation" under Conventions)
- **Showing a session**: `ComponentServiceAndHistory`'s history table marks
  any event with `service_session_id` set with a small "Part of a service
  session · N items" control (N counts every event in the session, not just
  this component's own — a session can span several components on one bike),
  opening `ServiceSessionViewModal` (date, note, every event, Edit
  date/note, Delete session via `confirmDelete` naming the event count).
  `MaintenanceEventFormModal`'s date field is `disabled` with explanatory text
  whenever the event being edited is session-bound, matching the backend
  validation up front rather than only surfacing it as a 422 after the fact.

