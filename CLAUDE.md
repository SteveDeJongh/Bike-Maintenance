# Bike Maintenance App

Tracks wear on bike components (chains, cassettes, tires, etc.) across one or more bikes,
attributing mileage from Strava ride data based on which component was mounted on which
bike and when. Also logs maintenance events (e.g. chain waxing) so "distance since last
service" can be tracked separately from lifetime distance.

Concrete driving use case: two waxed chains rotating on a Cervelo Soloist. Need total
lifetime mileage per chain, plus mileage since it was last waxed, with the ability to
mark a chain "on" or "off" a bike from a given date so mileage during that window is
attributed to the right chain.

## Stack

- Ruby on Rails (API-only, `config.api_only = true`), Postgres — lives in `api/`
- Separate frontend SPA built with Vite (React + TypeScript), running on
  `localhost:5173` in development. The Rails app talks to it only via CORS (see
  `api/config/initializers/cors.rb`) — no server-rendered views, no
  Hotwire/Turbo/Stimulus/importmap. This replaced the original Hotwire-based UI
  plan. Lives in `frontend/`, a sibling directory alongside `api/`. Uses
  `react-router-dom` for routing, `@tanstack/react-query` for data fetching, Mantine
  (`@mantine/core`) for UI components, and `@dnd-kit/*` for the column-reorder drag
  interaction in sortable tables (see "Sortable, configurable tables" below).
- Hosting TBD (Render or Fly.io are the leading candidates) — not needed until Phase 2

## Repo layout

This is a monorepo. The Rails app is rooted at `api/`, not the repo root — run
`bundle`, `rails`, `rspec`, etc. from inside `api/`. This file (CLAUDE.md) stays at
the repo root since it covers the whole project, not just the API. The Dockerfile
in `api/` expects to be built with `api/` as the build context (e.g. `cd api &&
docker build .`), not the repo root.

## Data model

- `User`: name (required), email (nullable — Google asserts one but Strava never does;
  unique case-insensitively via a partial index on `lower(email)` where not null, backed
  by `normalizes :email`), email_verified_at (nullable datetime), password_digest
  (nullable — `has_secure_password(validations: false)`; a Google/Strava-only user has
  none). `after_create` calls `Users::Provision` (see below) regardless of how the user
  was created — registration, OmniAuth, `users:claim`, console, seeds. See
  "Authentication" below for the full picture; `ApplicationController#current_user` is
  no longer a placeholder.
- `UserIdentity`: user_id, provider (`"google"`/`"strava"`/later `"apple"`), uid (the
  provider's stable subject id — Google's `sub`, Strava's athlete id as a string), email
  (as the provider asserted it, nullable), email_verified (boolean), last_used_at.
  Unique per `(provider, uid)` and per `(user_id, provider)` — one Google identity per
  user is enough. Email+password is not a row here; it lives on `User` directly.
- `TableViewPreference`: user_id, table_key (string, e.g. `"bikes"`), data (jsonb,
  default `{}`) — unique per `(user_id, table_key)`. The generic backing store for any
  sortable/configurable-column table in the app (see "Sortable, configurable tables"
  below), not Bikes-specific — a second list page gets its own `table_key`, reusing the
  same model/endpoint. `data` holds `{ columns: [...], sort_column, sort_direction }`;
  validated only as "must be a Hash" — like `Component#category`, the actual allowed
  column keys live only on each page's own frontend constant (e.g. `constants.ts`'s
  `BIKE_LIST_COLUMNS`), not enforced server-side. Exposed via `GET/PATCH
  /table_view_preferences/:table_key` — `update` upserts (a user may not have a row for
  that key yet), and a `PATCH` always replaces the whole `data` value (no deep merge),
  so the frontend must send the complete object on every change, not just the changed
  field.
- `Bike`: user_id, name, make, model, strava_gear_id, acquired_on (date, nullable —
  purchase date; validated `<=` `retired_on` when both present), retired_on,
  bike_type_id (nullable FK to `BikeType`, validated same-user — see "Bike setup"
  below). `acquired_on` is also the default "Installed since" date in the batched
  component setup step.
- `Component`: user_id, label (e.g. "Chain A"), category (chain, cassette, tire_front,
  tire_rear, ...), acquired_on, retired_on, brand (string, nullable), model (string,
  nullable), notes (text, nullable) — category doubles as a "slot" for validation.
  `brand`/`model` are `normalizes`d (`v.squish.presence`, same convention as
  `User#normalizes :email`) — whitespace-collapsed, blank becomes `nil`, casing left
  alone (see "Brand/model autocomplete" below for where casing gets handled instead).
  No backfill — an existing row only normalizes the next time it's saved.
- `BikeComponentSlot`: bike_id, category, ride_context (string: `"both"`/`"outdoor_only"`/
  `"indoor_only"`, same enum/validation as `ComponentAssignment#ride_context`, DB default
  `"both"`) — unique per `(bike_id, category, ride_context)`. What "+ Track a new
  component type" on the Bike detail page creates; each row is independently
  created/removed. A category normally has at most one slot (`"both"`) per bike, but a
  category with `ComponentCategorySetting#allows_multiple_assignments` can have up to
  two, one `outdoor_only` and one `indoor_only` — real, separate rows a user tracks and
  stops tracking on their own (e.g. a dedicated outdoor cassette slot and a separate
  indoor/trainer cassette slot on the same bike), not a computed pairing. A non-`"both"`
  `ride_context` is only valid when the category actually allows it. `before_destroy`
  blocks removing a slot that still has a matching active assignment — for a `"both"`
  slot, any active assignment of that category; for a split slot, only one whose own
  `ride_context` matches, so stopping tracking one variant is never blocked by the
  other's still-active assignment.
- `ComponentAssignment`: component_id, bike_id, started_at, ended_at (nullable = currently
  mounted), ride_context (string: `"both"`/`"outdoor_only"`/`"indoor_only"`, default
  `"both"`, backend-validated — unlike `category`, this one directly drives computation,
  so it's a real enum, not a free-text frontend-owned concept). No overlapping
  assignments for the same component, and no overlapping assignments for the same
  (bike, category) slot, with two exceptions, both gated behind that category's
  `ComponentCategorySetting#allows_multiple_assignments` being `true` (a category with no
  such setting, or an explicit `false`, stays strictly single-install-only):
  - same bike, same category: an `outdoor_only` + `indoor_only` pair, one per
    independent `BikeComponentSlot` (e.g. a dedicated trainer cassette installed
    alongside a dedicated road cassette on the same bike at the same time).
  - same component, different bikes: two concurrent `indoor_only` assignments (e.g. a
    cassette that physically lives on the trainer, not on any one bike's frame — "which
    bike" is just an attribution label for a ride, not a claim about where the part is
    mounted, so the same component can be "installed" on whichever bike is currently
    clipped into the trainer). Both sides must be `indoor_only` here — unlike the
    same-slot case, there's no one-each-context pairing across bikes.
  Timestamps, not dates: a component can be swapped more than once in a day.
  Validates that `component.user_id == bike.user_id` (no cross-user assignments).
  Reachable from a `User` via `has_many through:` on `bikes` — no direct `user_id`
  column of its own.
- `ComponentCategorySetting`: user_id, category, default_ride_context (string, same
  3-value enum/validation as `ComponentAssignment#ride_context`, DB default `"both"`),
  trackable (boolean, DB default `true`), allows_multiple_assignments (boolean, DB
  default `false`) — unique per `(user_id, category)`. User-serviceable (`GET
  /component_category_settings` returns every category's settings at once; `PATCH
  /component_category_settings/:category` upserts one, same upsert-by-key
  convention as `TableViewPreference`'s own `PATCH`), surfaced on the Settings
  page's "Component Categories" section:
  - `default_ride_context` is a default-suggestion only — which `ride_context` to
    pre-select when installing a new component of that category. It does *not*
    restrict what any individual assignment's `ride_context` can actually be set to,
    which is what makes the indoor/outdoor-cassette scenario above possible (the
    category default can say `outdoor_only` while one specific assignment is still
    manually set to `indoor_only`).
  - `trackable` gates every "start something new in this category" flow (the Bike
    detail "+ Track a new component type" dropdown, the standalone Components page's
    "+ New Component" category picker) — purely a frontend creation-time filter, never
    retroactive against already-tracked slots or already-created components.
  - `allows_multiple_assignments` is the one setting with real backend teeth — it's
    what lets a category's `BikeComponentSlot` be split into independent
    `outdoor_only`/`indoor_only` slots at all, and what `ComponentAssignment`'s overlap
    validation reads to decide whether an outdoor_only+indoor_only pair (one slot each),
    or the same component shared indoor_only across bikes, is permitted for that
    category (see above). One setting deliberately backs both cases rather than two
    separate columns — they're the same underlying idea for a category ("not strictly
    one-active-installation-at-a-time"), and splitting them isn't justified until a real
    need for independent control over each surfaces.
  A missing row behaves as each column's own DB default (`"both"`/`true`/`false`).
  Every user gets a fully editable starting point for each of the 18 known categories
  — picker order is drivetrain → wheels/tires → brakes → contact points → frame/
  suspension → power meter: `chain`/`cassette`/`chainring`/`bottom_bracket`,
  `wheel_front`/`wheel_rear`/`tire_front`/`tire_rear`, `brake_pads_front`/
  `brake_pads_rear`, `saddle`/`handlebar_tape`/`pedals`, `frame`/`front_suspension`/
  `rear_suspension`/`seat_post`, `power_meter`. (`rear_suspension` replaced the
  earlier `shock` category — see `common_brands` below.) `default_ride_context` is
  `"outdoor_only"` for tire_front/tire_rear/wheel_front/wheel_rear/
  brake_pads_front/brake_pads_rear/front_suspension/rear_suspension, `"both"` for
  everything else, including `cassette` (a fresh cassette defaults to accruing
  mileage from every ride; a user running separate road/trainer cassettes sets up
  the outdoor_only/indoor_only split explicitly — see "Bike setup" below); only
  `cassette` seeds `allows_multiple_assignments: true` — deliberately *not*
  hardcoded logic, every row is changeable via the Settings page.
  `handlebar_tape`'s label is `"Handlebar Tape/Grips"` (key unchanged — renaming it
  would mean a data migration across components/slots/settings/intervals for no
  gain). For users existing before a given category was added, a migration backfills
  it (`find_or_create_by`-equivalent `ON CONFLICT DO NOTHING`, never overwriting an
  edited row); for every user since, it's `Users::Provision` (see "Authentication"
  below), which replicates the exact same values on `User#after_create`. Fully
  user-definable categories were raised during design but are an explicitly deferred
  future idea, not built — categories stay free-text exactly as they are today (a
  custom category with the same key as a later-added built-in, e.g. a pre-existing
  `front_suspension`, just becomes that built-in; the migration's `ON CONFLICT DO
  NOTHING` leaves it and its settings untouched — a genuine near-duplicate under a
  different key is never auto-merged automatically; one real instance of this,
  `rear_shock` alongside `shock`, was resolved by hand — see `common_brands` below).
  Also carries two nullable notification overrides, `notifications_enabled` and
  `warning_threshold_percent` — `nil` means "inherit the global `NotificationSetting`"
  (see below), the same missing-value-means-inherit convention this model's other
  columns already use relative to their own DB defaults. `common_brands` (string
  array, DB default `[]`) is the "Common brands" suggestions in the component brand
  autocomplete — seeded per category the same way as the columns above (a migration
  for existing users, `Users::Provision` for new ones), fully editable via the same
  Settings page; `frame` and any custom category just keep the `[]` default, since
  there's nothing sensible to guess. Deduped case-insensitively, keeping the first
  spelling seen (`Array#uniq` with a block already does this). Four front/rear
  pairs — `tire_front`/`tire_rear`, `wheel_front`/`wheel_rear`,
  `brake_pads_front`/`brake_pads_rear`, `front_suspension`/`rear_suspension`
  (`ComponentCategorySetting::BRAND_LIST_PAIRS`, exposed to the frontend as each
  setting's own `brand_list_partner`, though the frontend only uses it to mirror an
  in-progress edit onto the partner row, not to show it) — always share one
  `common_brands` list: a write to either side is mirrored onto the other, in the
  same transaction, by `ComponentCategorySettings::UpdateCommonBrands`. A category
  merely *seeded* from the same brand group (e.g. `chain`/`cassette`) is not paired
  this way — that was only ever a shared starting point. `rear_suspension` itself
  replaced the old `shock` category (removed outright, by request) and the
  user's own near-duplicate custom `rear_shock` category (renamed, not merged —
  the one `RemoveShockRenameRearShockToRearSuspension` migration did both). Saving
  a `Component` with a brand not already in its category's list
  (case-insensitively) appends it there via `ComponentCategorySettings::AddCommonBrand`
  (`Component#remember_brand`, an `after_save`) — add-only: deleting/retiring a
  component, or clearing its brand, never removes anything, and a brand removed on
  the Settings page is re-added if a component using it is saved again. See "Brand/
  model autocomplete" below.
- `ServiceType`: user_id, name — unique per `(user_id, lower(name))`. A user-defined
  kind of maintenance (wax, sealant top-up, brake bleed, ...), replacing
  `MaintenanceEvent`'s old hardcoded `event_type` enum — per this file's own rule,
  something that now drives real computation (service intervals) gets a real model,
  not free text like `category`. Renaming is safe everywhere (every reference is by
  id); deleting a type still in use by any `MaintenanceEvent` or service interval is
  blocked (`restrict_with_error`). Managed on the Settings page, and every
  service-type picker in the app can also create one inline. `Users::Provision` seeds
  `wax`/`clean`/`replace`/`inspect` for every new user (the same fallback the original
  migration used for a user with no existing events — a brand new user always matches
  that fallback). Belongs to its owning user *directly* (`MaintenanceEvent`,
  `ComponentServiceInterval`, and `CategoryServiceInterval` all validate that any
  `service_type_id` they reference shares their own owner — see "Authentication"
  below for why this needed a fix).
- `MaintenanceEvent`: component_id, service_type_id, performed_at (timestamp), notes.
  Reachable from a `User` via `has_many through:` on `components` — no direct
  `user_id` column of its own. Logging one is what resets a service interval's
  baseline (see "Service intervals and maintenance alerts" below) — nothing is stored
  as a counter; progress is always computed from event history.
- `CategoryServiceInterval`: user_id, category, service_type_id,
  distance_interval_meters (nullable), time_interval_days (nullable) — unique per
  `(user_id, category, service_type_id)`, at least one of distance/time required. A
  suggested interval template for a category (e.g. chain → wax every 300 km),
  user-managed on the Component Categories settings page. Creating a component in a
  category auto-creates an enabled, linked `ComponentServiceInterval` for each of
  that category's templates (`Component#after_create`); adding a template later does
  **not** retroactively attach to existing components — that's an explicit "apply to
  these components" action instead (`POST /category_service_intervals/:id/apply`).
  Deleting a template deletes its linked `ComponentServiceInterval` rows; custom
  (unlinked) rows are untouched.
- `ComponentServiceInterval`: component_id, category_service_interval_id (nullable —
  null means custom, not linked to a template), service_type_id,
  distance_interval_meters (nullable), time_interval_days (nullable), enabled
  (boolean, default `true`) — unique per `(component_id, service_type_id)`, at least
  one of distance/time/linked-template required. What actually applies to one
  component. A **linked** row (template id set) inherits the template's values live
  through `#effective_distance_interval_meters`/`#effective_time_interval_days` —
  its own value columns are nilable per-component overrides, `nil` meaning "use the
  template" — callers always go through those two methods, never resolve the
  inheritance themselves. A **custom** row (no template) carries its own values
  directly. Disabling (`enabled: false`) keeps the row, evaluated as if absent, and
  re-enablable in place; removing (destroy) is a real delete — the component loses
  that category default entirely, and nothing re-adds it automatically. The component
  page offers "+ Add from category defaults" (`POST
  /component_service_intervals/apply_defaults`) listing the category's templates not
  currently represented on this component by service type — this is also how a
  previously-removed default gets added back, since there is no removal history:
  "never had it" and "had it and removed it" are treated identically, both simply
  available to add.
- `NotificationSetting`: user_id (unique — one row per user), notifications_enabled
  (boolean, default `true`), warning_threshold_percent (integer, default `5`). Global
  per-user defaults for service alerts; a missing row behaves as the hardcoded
  true/5% default, same convention as `ComponentCategorySetting`. A category's own
  `notifications_enabled`/`warning_threshold_percent` override these when set;
  `NotificationSetting.effective_for(user:, category:)` is the one place that
  resolves category-override-then-global-then-hardcoded-default — callers never
  chase that fallback chain themselves.
- `ServiceAlertDismissal`: component_service_interval_id, dismissed_at (timestamp),
  dismissed_status (`"warning"` or `"due"`). Recorded by `POST
  /service_alert_dismissals` (one interval) or `POST
  /service_alert_dismissals/dismiss_all` (every currently banner-eligible alert, or
  just those of one status via an optional `status` param — backs each banner's own
  "dismiss all" without clearing the other banner's alerts too). A dismissal only
  suppresses its own status: it expires on the next completed sync after
  `dismissed_at` (see `StravaCredential#last_synced_at` below), and it stops
  suppressing immediately if the status has since escalated (a dismissed `warning`
  that becomes `due` shows again right away). Logging the service clears it
  implicitly, since the status just returns to `ok`.
- `StravaActivity`: user_id, strava_id (unique), bike_id (resolved from gear_id,
  nullable until mapped), gear_id (Strava's raw per-activity identifier, stored
  separately from bike_id so a bike mapped *after* activities were already synced can
  retroactively backfill them — see `StravaActivity.reconcile_for_bike!`),
  distance_meters, moved_at (timestamp — the ride's start), name, activity_type (set
  from Strava's `sport_type`, not `type` — every stored row is already filtered to
  `type` being `"Ride"` or `"VirtualRide"` (`StravaSyncJob::SYNCED_TYPES`), so
  `sport_type`'s finer granularity is the useful part), synced_at. `#indoor`/`#outdoor`
  scopes are the actual signal mileage attribution uses for indoor/outdoor, not the raw
  `trainer` column alone — confirmed empirically that Zwift's Strava integration does
  not reliably set `trainer: true` on its own uploads, so `activity_type == "VirtualRide"`
  also counts as indoor regardless of `trainer`. Also carries ride-analytics fields
  captured for later use (not yet surfaced in the UI): `trainer`, `commute`,
  `moving_time`, `elapsed_time`, `average_speed`, `max_speed`, `total_elevation_gain`,
  `average_watts`, `weighted_average_watts`, `device_watts`, `kilojoules`,
  `average_heartrate`, `max_heartrate`, `average_cadence` — all nullable except
  `trainer`/`commute`, since Strava omits them entirely (not even `null`) when an
  activity has no power meter/HR monitor/cadence sensor.
- `StravaCredential`: user_id (unique — one row per user), access_token, refresh_token,
  expires_at, athlete_id (also unique — one Strava athlete can't be attached to two
  different app accounts; the identity-linking rules in "Authentication" below are
  what makes this safe now that Strava is also a sign-in method, not just a data
  connection), scope, last_synced_at (nullable datetime). The latter is set
  at the end of every `StravaSyncJob#perform`, including a run that finds no new
  activities — the only "last completed sync" signal in the app (the incremental sync
  cursor itself is still just `StravaActivity.maximum(:moved_at)`, unrelated). It's
  what a `ServiceAlertDismissal` compares against to decide whether it's expired.
- `StravaGear`: user_id, strava_gear_id, name, brand_name, model (DB column — the
  obvious `model_name` collides with `ActiveModel::Naming#model_name`, which every
  ActiveRecord model inherits; the API's JSON still calls it `model_name` for clarity),
  retired, distance_meters, synced_at, ignored_at (nullable datetime) — unique per
  (user_id, strava_gear_id). A cache populated by `Strava::GearSync`, not derived from
  activity history alone; `Strava::GearSync#upsert_gear`'s `update!` only ever sets the
  Strava-sourced columns above, so a re-sync never touches `ignored_at`. The latter is
  a user's explicit "don't track this gear" decision (pre-app Strava history that isn't
  worth creating a bike for) — see "Strava integration" below for the three-choice
  gear-mapping model this is part of. A gear is never both mapped (claimed by a
  `Bike#strava_gear_id`) and ignored at once (`StravaGear` validates this, and mapping
  always clears a prior ignore — see below); `StravaGear.ignored`/`.not_ignored` scopes
  split on it directly, while `.unmapped_for`/`.ignored_for` both also factor in
  resurfacing (below).

## Core logic

Strava gear tracking is per-bike, not per-component, so mileage attribution is computed
(not stored), via a service object or model method:

- `Component#total_distance` = sum of StravaActivity.distance where bike_id matches one
  of the component's assignments and moved_at falls within that assignment's
  half-open [started_at, ended_at) window — or [started_at, ∞) while still mounted —
  summed across all the component's assignments. The window is half-open so that an
  activity on a swap boundary is credited to exactly one assignment, never both.
  Each assignment's own `ride_context` additionally restricts this to only outdoor
  activities (`outdoor_only`), only indoor activities (`indoor_only`, via
  `StravaActivity#indoor` — trainer rides and Zwift/virtual rides both count), or no
  restriction (`"both"`, the default) — see `ComponentAssignment#activities_from`,
  the one shared windowing+filtering primitive every mileage computation (lifetime
  and per-installation-period alike) funnels through.
- `Component#distance_since(service_type:)` = same sum, filtered to activities after
  the most recent `MaintenanceEvent` of that `ServiceType`.

Both of the above loop over the component's assignments in Ruby, issuing one
date-bounded query per assignment — unlike `Bike`'s stats, which batch into a single
grouped query per stat in `BikesController#index`. This is still fine today because
every current caller of these two specific methods (`ComponentDetail`, and a bike's
own small "Installed components" table) only ever renders a handful of components at
once; neither is used to back a many-row table column. Previously-noted future idea,
now resolved by a different, purpose-built query rather than by changing these two
methods: `Maintenance::BatchedDistanceQuery` (see "Service intervals and maintenance
alerts" below) implements exactly the batched join this note called for — a
`component_assignments` ⨝ `strava_activities` join on `bike_id` with a `moved_at`
range condition, `GROUP BY` the thing being measured — for service-interval
distance-since-baseline instead of `total_distance`, since that's what actually
needed to show on a many-row table (the Components list's and Bike detail's
`service_status` columns). If `total_distance`/`distance_since` themselves ever need
to back a many-row column too, the same pattern is now proven out and ready to reuse.

## Service intervals and maintenance alerts

User-defined "do service type X every N km and/or every N days" tracking, resolving
the "needs maintenance" future idea originally noted under Bike-level stats below.
Recording a service means creating a `MaintenanceEvent` of that type — nothing is
stored as a counter, progress is always computed from event history, same as
`Component#distance_since` above. See the `ServiceType`/`CategoryServiceInterval`/
`ComponentServiceInterval`/`NotificationSetting`/`ServiceAlertDismissal` bullets
above for the data model; this section covers how status gets computed and surfaced.

- `Maintenance::BatchedDistanceQuery.call(user)` — one raw SQL query (a CTE computing
  each enabled `ComponentServiceInterval`'s baseline — most recent matching
  `MaintenanceEvent`, else the component's earliest assignment, else `acquired_on` —
  joined to `strava_activities` the same way `ComponentAssignment#activities_from`
  already filters by `ride_context`) returning `{component_service_interval_id =>
  {distance_meters, baseline_at}}` for every one of the user's enabled intervals at
  once. The one piece of real batching in this feature — everything below reads from
  it rather than looping per interval.
- `Maintenance::IntervalStatus` wraps one interval's status: distance/time fraction
  used (whichever dimension is set; `days_used` is a cheap date subtraction, not
  batched), `due` when either fraction reaches 1.0, `warning` when either is within
  the effective `warning_threshold_percent` of 1.0, else `ok`. `.for_component`/
  `.for_user` are the two entry points (both batched via `BatchedDistanceQuery`);
  `.worst_status_by_component(user)` reduces that to one status per component
  (due > warning > ok) for the `service_status` table column. A component with no
  enabled interval has no entry — rendered as a dash, not an `ok` badge.
- Banner eligibility (`Result#banner_eligible?`) is stricter than just "not ok": the
  component must be currently installed (an assignment with `ended_at: nil`), not
  retired, have notifications enabled for its category
  (`NotificationSetting.effective_for`), and not be currently suppressed by a
  `ServiceAlertDismissal`. Ineligible intervals still compute and show a real status
  everywhere else (component page, table columns) — eligibility only gates the
  app-wide banners.
- API: `ServiceTypesController`, `CategoryServiceIntervalsController` (plus `POST
  .../:id/apply`), `ComponentServiceIntervalsController` (plus `POST
  .../apply_defaults`), `NotificationSettingsController` (singleton, upsert like
  `TableViewPreference`), `MaintenanceAlertsController#index` (`GET
  /maintenance_alerts`, banner-eligible statuses only), `ServiceAlertDismissalsController`
  (`#create`, `#dismiss_all` with an optional `status` param). `ComponentsController#show`
  includes every enabled interval's full computed status; `ComponentsController#index`
  and `BikesController#show` (per installed component) include just the batched
  `service_status` summary.
- Frontend: `Layout.tsx` renders `MaintenanceAlertBanners` above every page — a red
  "due" list and a collapsed-by-default yellow "warning" count, each item linking to
  its component with a "dismiss until next sync" control, each banner with its own
  "dismiss all" (scoped to that banner's own status via the `dismiss_all` endpoint's
  `status` param, so dismissing the due banner never also clears warnings). No
  modals/toasts. `frontend/src/components/ServiceIntervalsSection.tsx` (rendered
  by `ComponentServiceAndHistory.tsx`, shared by the standalone `ComponentDetail`
  page and `BikeDetail`'s `AssignmentDetailModal`) is where a component's
  intervals are enabled/disabled/overridden/removed/added (from a category
  default or custom) and where a service gets logged (`MaintenanceEventFormModal`
  with the interval's service type/component prefilled). Its table merges
  distance/time into one "Interval" column (`formatInterval` in
  `utils/serviceInterval.ts`, alongside the existing `formatRemaining` — only the
  dimension(s) actually set, never a "—" for a blank one), with a dimmed
  "(overridden)" suffix when a linked row's own distance/time columns are set
  (i.e. overriding the category template rather than inheriting it). Editing one
  interval opens `EditServiceIntervalModal` (not inline-in-row) — for a linked
  row it shows the template's own default values and a "Reset to default" action
  that clears both override columns (`nil` already means "inherit the template,"
  so this needs no backend support beyond the existing `PATCH`). Edit/Remove
  collapse into a `⋯` `ActionIcon`+`Menu` (Remove still via `confirmDelete`) below
  a width threshold measured on the section's own element via Mantine's
  `useElementSize` — not a viewport breakpoint, since this section also renders
  inside a modal narrower than the window — and the table itself is wrapped in
  `Table.ScrollContainer` so only it, never the rest of the modal, scrolls
  horizontally if it still doesn't fit. "Log service" never collapses.
  `ServiceStatusBadge`/`SERVICE_STATUS_COLORS`/`SERVICE_STATUS_SEVERITY` back the
  `service_status` column on the Components list and Bike detail's Installed
  Components table (through the existing configurable-table system), and (as of
  the above) the Service intervals table's own Status column too.

**Known limitation**: sync is still manual (see "Strava integration" below) — until a
scheduler is deployed, a dismissed alert stays hidden only until the user next
presses "Sync now". Time-based intervals keep advancing regardless of sync (`days_used`
is a plain date calculation), but a dismissal only lifts on a completed sync or on
escalation to a worse status.

## Strava integration

- OAuth scope: `activity:read_all,profile:read_all`. The `profile:read_all` half was
  added after the fact (originally just `activity:read_all`) specifically so
  `GET /athlete` returns the athlete's `bikes` array — confirmed empirically that
  without it, `GET /athlete` omits `bikes`/`shoes` entirely. Scope is granted at
  authorization time, so any credential connected before this addition needs the user
  to click "Connect to Strava" again to pick up the new permission.
- `app/services/strava/client.rb` wraps the HTTP calls (token exchange/refresh,
  paginated activity fetch, `GET /athlete`, `GET /gear/{id}`) via Faraday;
  `StravaCredential#ensure_fresh_access_token!` decides when to refresh (6-hour access
  token expiry) and persists Strava's rotated refresh_token. `client_id`/`client_secret`
  live in `config/credentials.yml.enc` under a `strava:` key (`bin/rails
  credentials:edit`) — required before `GET /auth/strava` will work. `redirect_uri` is
  built from the current request's host (the `strava_callback_url` route helper — the
  name predates the route move just below, but still resolves to the right path), not
  a fixed config value.
- `StravaController#authorize`/`#callback` live at `GET /auth/strava`/`GET
  /auth/strava/callback` (moved from `/strava/authorize`/`/strava/callback` — the
  Strava app's own "Authorization Callback Domain" setting is just a domain, e.g.
  `localhost`, not a full path, so this move needed no dashboard change). Both skip
  `require_authentication`: this is the one OAuth flow that's also a sign-in method
  (see "Authentication" below), so it has to work with no session at all.
  `authorize` generates a random `state`, stores it in `session[:strava_oauth_state]`,
  and passes it through; `callback` verifies it matches before doing anything else,
  redirecting with `?error=invalid_state` otherwise — without this, a victim's browser
  could be made to finish the callback with an attacker's code, linking the attacker's
  Strava athlete to the victim's account.
- Sync is triggered manually for now (`POST /strava/sync` enqueues `StravaSyncJob`) via
  a "Sync now" button on the frontend's `/strava` page. `bin/rails strava:sync_all`
  exists for a future production scheduler (e.g. a Render Cron Job) to call once the app
  is actually deployed — not wired up to anything automatic yet, since there's no
  deployed host. No webhook until there's a public URL.
- `StravaSyncJob` pages `GET /athlete/activities` incrementally, using
  `StravaActivity.maximum(:moved_at)` as the `after` cursor (no separate "last synced"
  column). Only `Ride`/`VirtualRide`-type activities are stored (`SYNCED_TYPES`) — the
  latter is what Zwift/virtual-trainer rides come back as, a distinct `type` from plain
  `"Ride"`, not a flag on a Ride. It also runs `Strava::GearSync` once after paging
  finishes, so the gear cache stays current on every routine sync. `perform(user_id,
  full_resync: true)` ignores the incremental cursor and re-fetches from the beginning of
  the user's history — the cursor only looks forward from the latest already-stored
  activity, so it can't backfill history from before a change like widening
  `SYNCED_TYPES`; safe to run repeatedly since `upsert_activity`'s
  `find_or_initialize_by` is idempotent. `bin/rails strava:resync_all` runs it for every
  connected user.
- `Strava::GearSync` (`app/services/strava/gear_sync.rb`) populates `StravaGear`: the
  known gear id set is the union of the athlete's current `GET /athlete` bikes list and
  every `gear_id` ever seen in synced activity history (kept even if Strava's athlete
  summary omits retired gear — unconfirmed either way, so the union avoids silently
  losing a known id), then each id gets enriched via `GET /gear/{id}` (name, brand,
  model, retired — none of which the activity or athlete endpoints provide). Runs on
  every sync, and via a dedicated "Refresh gear list" button (`POST
  /strava/refresh_gear`) for picking up a newly-added, not-yet-ridden bike immediately.
- Gear-to-bike mapping has no separate screen — it reuses the existing Bike edit form's
  "Strava gear ID" field (`PATCH /bikes/:id`), surfaced through the `/strava` page's
  list of currently-unmapped gear (`GET /strava/unmapped_gear`, sourced from the
  `StravaGear` cache, not activities directly — shows name/brand/model/retired status).
  Setting/changing a bike's `strava_gear_id` triggers reconciliation automatically (a
  `Bike` `after_save` callback, not `after_update` — it has to also fire when a bike is
  *created* with `strava_gear_id` already set, e.g. from the gear-mapping screen's
  "create new bike" flow). It handles both directions via
  `saved_change_to_strava_gear_id`'s old/new pair: activities matching the old gear id
  get `bike_id` nulled out, activities matching the new one get backfilled — needed for
  "unlink"/reassign on the Mapped gear section to be correct, not just additive. The
  same callback also clears `StravaGear#ignored_at` on the newly-mapped gear (a gear is
  never both mapped and ignored — see below) — one fix here covers `reassign_gear` too,
  since it maps gear by saving a `Bike`, routing through this same callback.
- A row of unmapped gear isn't limited to "map it to a bike" — most unmapped gear is
  pre-app Strava history (an old or retired bike) that doesn't need a tracked bike at
  all, and component mileage is already scoped to dated `ComponentAssignment` windows,
  so old rides never affect wear either way. Each row on `/strava` offers three
  choices: map to a bike (above), **track as retired bike** (a one-click `Bike` create
  from the gear's own name/brand/model, `strava_gear_id`, and `retired_on` defaulted to
  the gear's last activity date when known, else today — reuses the normal create-bike
  flow, so it still backfills activities the same way), or **don't track**
  (`POST /strava/ignore_gear`, sets `StravaGear#ignored_at`; rejected with a validation
  error if the gear is already mapped). Ignoring only filters what's shown/counted —
  syncing and storing that gear's activities continues unchanged, and un-ignoring
  (`POST /strava/unignore_gear`) takes effect instantly with no re-sync needed.
  **Resurfacing**: if an ignored gear gets a new activity dated after `ignored_at`
  (e.g. a bike un-retired on Strava), it's treated as no longer ignored for
  display/counting — it reappears in `GET /strava/unmapped_gear` (flagged
  `resurfaced: true`) instead of `GET /strava/ignored_gear`, computed at read time via
  `StravaGear::RESURFACED_CONDITION`, never by auto-clearing `ignored_at` itself
  (re-ignoring just sets it to now again). Retired gear is never auto-ignored — retired
  on Strava often still means "this bike's history matters," especially when parts
  moved to a newer bike.
- Bike-level stats (`Bike#total_distance`/`#total_moving_time`/`#first_ride_on`/
  `#last_ride_on`/`#total_elevation_gain`/`#installed_components_count`, shown on the
  Bikes list and detail page) sum/min/count directly over `strava_activities`/
  `component_assignments` — computed, not stored. `Bike#average_power` is the same,
  but restricted to `device_watts: true` activities (real power meter, not Strava's
  estimate) and **nil** (not 0) when the bike has none, so the UI can show "N/A"
  instead of a misleading "0 W". `BikesController#index` computes all of these via
  grouped queries (one per stat) to avoid per-bike N+1 on the list.
  Previously-noted future idea, now resolved: a "needs maintenance" column — see
  "Service intervals and maintenance alerts" above for the due-date/threshold concept
  that didn't exist when this note was written. `BikesController#show` merges each
  installed component's batched `service_status` into the response the same way
  `#index` merges its own grouped stats.

## Authentication

Real login — email/password, Google, and Strava — replacing the old
`ApplicationController#current_user` placeholder (`User.first!`). Built in
Rails, no hosted auth vendor.

- **Sessions, not tokens.** `ActionController::API` excludes cookie/session/
  CSRF middleware by default; `config/application.rb` adds back
  `ActionDispatch::Cookies` + `ActionDispatch::Session::CookieStore` (an
  httpOnly, `SameSite=Lax` cookie), and `ApplicationController` includes
  `ActionController::Cookies` + `ActionController::RequestForgeryProtection`
  (`protect_from_forgery with: :exception`). `current_user` is
  `User.find_by(id: session[:user_id])`; a `before_action
  :require_authentication` 401s every request with no `current_user`, skipped
  only on the auth endpoints themselves (`Auth::RegistrationsController#create`,
  `Auth::SessionsController#create`/`#destroy`, `Auth::CsrfController#show`,
  `Auth::PasswordsController#forgot`/`#reset`,
  `Auth::EmailVerificationsController#verify`, `StravaController#authorize`/
  `#callback`) and `/up`. Every sign-in/sign-out path calls `reset_session`
  first (session fixation). **Gotcha**: including `RequestForgeryProtection`
  directly on `ApplicationController` gives it its own `allow_forgery_protection`
  class_attribute with a fresh `true` default, shadowing whatever
  `ActionController::API` had already inherited from
  `config.action_controller.allow_forgery_protection` (which `test.rb` sets to
  `false`) — `ApplicationController` forwards that config value explicitly to
  fix it.
- **Gotcha, the expensive one**: `config/initializers/cors.rb` must set
  `credentials: true` on the `resource` block, and `origins` must be a literal
  origin (never `"*"`) — without `credentials: true`, the browser still sends
  the session cookie on the frontend's `fetch(..., { credentials: 'include' })`
  calls, but refuses to let the frontend's JavaScript read the response at
  all. That isn't a clean 401; `fetch()` just rejects with a generic network
  error, which looks exactly like "not signed in" even when the server-side
  sign-in genuinely succeeded (confirmed: the Rails log showed a correct
  session + successful `Auth::ResolveIdentity` match, while the SPA still
  bounced straight back to `/login`). Easy to miss because every backend
  request spec exercises the Rack app directly and never goes through actual
  browser CORS enforcement at all — only a real browser surfaces this.
- **CSRF**: the SPA fetches a token from `GET /auth/csrf` (works before
  login — the token is tied to the session, not to a signed-in user), caches
  it in memory, and sends it as `X-CSRF-Token` on every non-GET request
  (`frontend/src/api/client.ts`, lazily fetched on the first non-GET call of
  a page load, not on boot). `rack-attack` (not CSRF-related, but
  lives at this layer too) throttles `/auth/login`, `/auth/register`,
  `/auth/password/forgot`, and `/auth/email/resend` by IP and (for
  login/forgot-password) by email — `config/initializers/rack_attack.rb`
  reads the email from the raw JSON body when present, since Rack::Attack
  runs ahead of Rails' own parameter parsing and the frontend posts JSON, not
  form-encoded params.
- **`Auth::ResolveIdentity`** (`app/services/auth/resolve_identity.rb`) is the
  one place that decides who an OAuth callback signs in, links, or creates,
  in order:
  1. An identity already exists for `(provider, uid)` → sign in that user. If
     a different `current_user` is already signed in (the explicit "link"
     flow from Account settings hit an identity owned by someone else),
     raise `AlreadyLinkedToAnotherUser` instead.
  2. No identity yet, but `current_user` is signed in (the link flow) →
     attach the identity to `current_user`.
  3. No identity, not signed in, the provider asserts a **verified** email
     matching an existing `User#email` → link and sign in. If that user's own
     email was never verified (an unconfirmed password signup), the provider
     just proved ownership of the address — link it, set
     `email_verified_at`, and clear `password_digest` (the unproven password
     could belong to whoever registered that address first, not its real
     owner; they can set a new one from Account settings).
  4. Otherwise → create a new `User` (`Users::Provision` fires via
     `User#after_create`, same as any other creation path) and link.
  Never links by an email the provider didn't mark as verified. Google
  asserts `email_verified`; **Strava never asserts an email at all**, so it
  can only ever reach branches 1, 2, or 4 — never 3.
- **Strava is both a sign-in method and the data connection** — one OAuth
  grant does both, decided by whether a session user existed going into
  `StravaController#callback` (see "Strava integration" above for the
  route/state details). The resulting `StravaCredential` attaches to
  whichever user `Auth::ResolveIdentity` resolves to, never blindly to
  `current_user`. A connect (already signed in) redirects back to
  `/strava?connected=1`; a fresh sign-in has nowhere Strava-specific to go,
  so it lands on `/`.
- **Google** is deferred — the identity-linking model and `Auth::ResolveIdentity`
  are already provider-agnostic and ready for it, but it needs a real OAuth
  client id/secret from the Google Cloud Console (`bin/rails
  credentials:edit`, a `google:` key) before the OmniAuth wiring,
  `Auth::OmniauthCallbacksController`, and the "Continue with Google" button
  are worth adding. Apple is deferred further still (see "Not building yet"
  below) but the schema already accommodates it — `UserIdentity#provider`
  includes `"apple"`.
- **`rails "users:claim[email@example.com]"`** (`lib/tasks/users.rake`) gives
  the pre-auth seed user (created by
  `20261013224709_add_user_to_ownership_tables.rb`, back when the app was
  single-user with no real accounts) a real, verified email, and links its
  `StravaCredential` as a sign-in identity if it has one. Run once, early.
  The seed user is found as "the one user with no verified email, no
  password, and no linked identity" — `password_digest: nil` specifically is
  what keeps this from accidentally matching an ordinary unverified
  email/password signup, which looks identical under the other two
  conditions (the seed user predates `has_secure_password` and has never had
  a password set; a real registrant always does).
- **Mailer**: `UserMailer#password_reset`/`#email_verification`, plain text
  views, caught by `letter_opener_web` (mounted at `/letter_opener`) in
  development instead of a real delivery service. Production's delivery
  method (Postmark, SES, etc.) is a deliberately deferred config choice, not
  picked yet. `lib/frontend.rb`'s `Frontend.url(path)` is the one place that
  knows the frontend's base URL (`ENV["FRONTEND_URL"]`, default
  `http://localhost:5173`) — used by the mailer views and by
  `StravaController`'s redirects alike.
- **Password reset / email verification tokens** use Rails 7.1's
  `generates_token_for` on `User` — `:password_reset` (20 min, keyed off
  `password_salt`, so the token dies the instant the password changes any
  other way) and `:email_verification` (1 day, keyed off `email`, so
  changing the email kills an outstanding token) — no token storage or
  revocation of our own needed.
- **Required environment**: `FRONTEND_URL` (defaults to
  `http://localhost:5173` in development); `strava:`/`google:` keys in
  `config/credentials.yml.enc` (Strava already set up; Google not yet — see
  above); a real `config.action_mailer.delivery_method` in production (not
  chosen yet).

**Not building yet (deployment notes for when this app is actually deployed):**
- **Same-site cookies need a shared registrable domain.** The `SameSite=Lax`
  session cookie only works if the frontend and API share one, e.g.
  `app.example.com` + `api.example.com` — two hosts on a platform's shared
  domain (`*.onrender.com`, `*.fly.dev`) count as different sites and won't
  receive the cookie. Deploy on a custom domain, or serve both from one
  service.
- **Strava's new-API-app athlete cap.** A new Strava API app only allows its
  owner's account until raised; up to 10 athletes is a self-serve change in
  Strava's API settings, beyond that needs Strava's review. Check before
  inviting anyone else to sign in with Strava.
- **Apple**, when it's worth the paid developer account: add
  `omniauth-apple`. Apple POSTs back to the callback cross-site
  (`response_mode=form_post`), so the session cookie isn't sent on that
  request — carry `state`/`nonce` in a short-lived `SameSite=None; Secure`
  cookie instead, or use the gem's documented workaround. Apple returns the
  user's name only on first authorization, and the email may be a private
  relay address — both already fine under `Auth::ResolveIdentity`'s rules
  above.

## Sortable, configurable tables

Built from reusable pieces, not a one-off for any single page — in production use
on six tables: the Bikes list, the Bike detail page's Installed components and
History tables, and the Components/Maintenance Events/Assignments lists (each its
own `table_key`: `bikes`, `bike_installed_components`, `bike_history`,
`components`, `maintenance_events`, `assignments`). A future page can adopt the
same UX without rework:
- `frontend/src/hooks/useTableViewPreferences.ts` — headless hook owning a table's
  column order/visibility and sort state, backed by `TableViewPreference` via
  `useTableViewPreference`/`useUpdateTableViewPreference` (`api/queries.ts`/
  `api/mutations.ts`). Takes a `tableKey` plus the page's own column/sort constants
  (e.g. `BIKE_LIST_COLUMNS`) — it doesn't know about Bikes specifically. Returns
  `orderedColumns`, `toggleColumn`, `reorderColumn`, `onHeaderDragEnd` (a ready-made
  dnd-kit `DragEndEvent` handler — wire it straight into a `<DndContext>`, no need to
  hand-translate drag ids into a `reorderColumn` call), `sortColumn`/`sortDirection`/
  `setSort`, and `saveError`/`clearSaveError`. Its `useState` initializers seed from
  the preferences query's data **once**, on mount — the calling page must not render
  the component that calls this hook until that query has resolved (`Bikes.tsx` gates
  on `preferencePending` before rendering `BikesTable`), the same remount-on-stale-data
  lesson learned from a bug on the Bike detail page. If a page ever needs to swap
  `tableKey` on an already-mounted component (e.g. tabs that don't unmount), it must
  force a remount via `key={tableKey}` rather than relying on the hook to notice the
  change.
- `frontend/src/components/datatable/ColumnPicker.tsx` — the "+" icon/popover column
  picker (rendered as the last `<Table.Th>` in the header row, not floated above the
  table), with a draggable "Visible" section and a static "Available" section.
  `frontend/src/components/datatable/DraggableHeaderCell.tsx` — the configurable
  columns' header cell: also draggable, directly in the live table, via the same
  `@dnd-kit/core`/`@dnd-kit/sortable`/`@dnd-kit/utilities` machinery. Both the popover
  and the live headers can reorder columns; they write through the same hook state, so
  either one stays in sync with the other. Dragging and click-to-sort never conflict
  on the same header cell because each `DraggableHeaderCell` has a **separate drag
  handle glyph** next to its clickable sort label — drag listeners only attach to the
  handle (see `useColumnDragHandle`), not the whole cell, which is the standard dnd-kit
  pattern for combining drag with another click behavior on the same element.
  `columns` in `TableViewPreference#data` is one ordered array: presence means
  visible, position means display order (no separate unordered "visible" list).
- `frontend/src/components/datatable/useColumnDragHandle.ts` /
  `useColumnDragSensors.ts` — small shared pieces behind both drag surfaces (the
  popover rows and the live headers): a `useSortable` wrapper returning ref/style/
  handle props, and the `PointerSensor` activation-distance setup (so a plain click
  doesn't register as a drag attempt).
- `frontend/src/components/datatable/SortableHeaderCell.tsx` — a `<Table.Th>` wrapper
  for the ▲/▼ click-to-sort indicator, used for pinned (non-draggable) columns like
  Bikes' Name.
- A page still writes its own `<Table>` body — pinned/special-cased columns stay
  hand-coded around the generic, hook-driven columns, rather than the reusable
  pieces trying to support every possible column type generically. A pinned
  column is specifically one with a real navigation target (consistently true
  across every adopter so far: Bikes' Name, Components' Label, the Bike detail
  tables' Category+Component, Maintenance Events' Component, Assignments'
  Component+Bike) — not just "the most important field." A row can have more than
  one pinned column when its identity genuinely needs more than one coordinate
  (Category+Component; Component+Bike) rather than one. Where a page didn't
  previously link a column that becomes pinned (Maintenance Events' Component;
  Assignments' Component and Bike), the link gets added as part of adopting this —
  "pinned" is expected to mean "clickable" everywhere in the app.

**To adopt this on a new or existing table**, define on the frontend (nothing to
build on the backend — `TableViewPreference`/`/table_view_preferences/:table_key` is
already generic): a `tableKey` string unique to that table; a column-keys constant +
display-label map + default-visible subset (mirroring `BIKE_LIST_COLUMNS`/
`BIKE_LIST_COLUMN_LABELS`/`DEFAULT_BIKE_LIST_COLUMNS` in `constants.ts`); a
sort-keys constant if any pinned column should be sortable too (mirroring
`BIKE_LIST_SORT_COLUMNS`, which adds `'name'` on top of the toggleable columns); a
`columnValue` map (comparable value per sortable column, `null` for "not
applicable" — always sorts last) and a `columnRenderer` map (display `ReactNode` per
column) keyed the same way `Bikes.tsx` does. Call `useTableViewPreferences` with
those constants, then render pinned columns by hand and map the configurable ones
through `<DraggableHeaderCell>`/`columnRenderer`, with `<ColumnPicker>` as the final
header cell — `Bikes.tsx` is the reference implementation to copy the shape from.
Don't add new per-row computed/aggregated columns to a list page without checking
whether the underlying data is already batched for that scale (see
`Component#total_distance`'s note above) — this mechanism makes columns easy to
add, but doesn't change the cost of computing what's behind them.

## Theming

Light/dark/system appearance lives entirely in the frontend, built on
Mantine's color-scheme support — nothing on the backend:
- `frontend/src/main.tsx` — `theme.colors.dark` (near-black body + layered
  grey surfaces) and `theme.colors.radar` (the phosphor-green accent,
  `primaryColor: 'radar'`, scheme-aware `primaryShade`, `autoContrast: true`),
  plus `defaultColorScheme="auto"` and `colorSchemeManager` on
  `MantineProvider`.
- `frontend/src/index.css` — a few `[data-mantine-color-scheme='dark']`
  rules that lift Paper/Modal/AppShell-header one shade above the near-black
  body (they default to the same `--mantine-color-body` var as the page).
  Table rows and Popover/Menu dropdowns already layer correctly from the
  `dark` palette alone, via Mantine's own CSS — no extra rules needed there.
- `frontend/index.html` — a small inline script setting
  `data-mantine-color-scheme` on `<html>` before React mounts, to avoid a
  flash of the wrong theme on load (there's no SSR to render Mantine's
  `ColorSchemeScript` component server-side, so it's hand-written instead,
  reading the same localStorage key `localStorageColorSchemeManager` uses).
- `frontend/src/pages/settings/AppearancePage.tsx` — the user-facing control
  (a `SegmentedControl` calling `useMantineColorScheme().setColorScheme`).

The accent is a custom 10-shade "radar" green used as `primaryColor` in both
modes (a deep, readable-on-white shade in light mode; a bright phosphor-green
shade in dark mode). `SERVICE_STATUS_COLORS` in `constants.ts` deliberately
uses `teal`, not `green`, for "ok," so a service-status badge never reads as
the same color as the accent.

The choice is persisted with Mantine's `localStorageColorSchemeManager`
(plain browser localStorage), not a backend preference in the style of
`TableViewPreference`. `TableViewPreference` exists because column layout is
account-level state a user expects to follow them to any device they log in
on; appearance is a per-browser display preference, and — unlike a column
layout — it has to be resolved *before* React even mounts to avoid a flash of
the wrong theme, which a server round trip can't satisfy without SSR. Plain
localStorage is simpler and sufficient here.

Never hardcode a color (hex or otherwise) in a component. Use a Mantine theme
token/CSS variable (`var(--mantine-color-*)`, a named color like `"teal"` or
`"red"`, or `"radar"`) so every surface stays correct across both color
schemes without a per-component light/dark branch.

## Dashboard

The app's landing page (`frontend/src/pages/Dashboard.tsx`, at `/`) answers "is my
data current?" and "what needs my attention?" at a glance — it replaced the old
`Landing.tsx` (four link cards that just duplicated the nav bar). Backed by a single
`GET /dashboard` request, assembled by `Dashboard::Summary.call(user, tz:)`
(`app/services/dashboard/summary.rb`) entirely from existing primitives — no new
distance/status computation happens here that doesn't already live elsewhere:

- **`sync`** — `StravaCredential#last_synced_at`, a count/distance split of
  `strava_activities` with `bike_id: nil` into `with_gear` (fixable via gear
  mapping) vs `without_gear` (Strava itself had no bike set), and
  `unmapped_gear_count` from `StravaGear.unmapped_for(user)` (promoted from a
  `StravaController#unmapped_gear`-private query to a model class method — that
  controller action now calls the same method, output unchanged). A ride whose gear
  is ignored (and hasn't resurfaced — see "Strava integration" above) is excluded from
  `unattributed`/`with_gear` entirely via `StravaGear.ignored_for(user)`'s gear ids,
  same as if it were attributed; a no-gear ride is explicitly spared from that
  exclusion's `gear_id NOT IN (...)` check, since that's not NULL-safe on its own
  (`where.not(gear_id: [...])` would otherwise also exclude a `NULL` `gear_id` via
  SQL's three-valued `IN` logic).
- **`bikes`** — one entry per non-retired bike: `total_distance`/`ride_count`/
  `last_ride_on`/`distance_this_month` via the same grouped-query-per-stat pattern
  `BikesController#index` already uses (no per-bike N+1), plus `mounted`
  (currently-installed components, each with a `display_metric`: meters/days only,
  same API-returns-meters/UI-converts convention as everywhere else — see
  `formatDistance`) and `off_bike` (non-retired components whose most recent
  assignment was on this bike but have no active one anywhere). Both draw their
  per-component status from `Maintenance::IntervalStatus.worst_result_by_component`
  (returns the full winning `Result`, not just its status string — a small,
  justified extension over the pre-existing `worst_status_by_component`, now a
  one-line wrapper over it) and their bike-grouping from
  `Component.current_bikes_by_component` (promoted the same way as
  `StravaGear.unmapped_for`, from a `ComponentsController`-private method).
- **`attention`** — every enabled, non-ok, non-retired interval
  (`Maintenance::IntervalStatus.for_user`), deliberately broader than the alert
  banners' `Result#banner_eligible?`: a dismissed or notifications-off item, or one
  on a currently-unmounted component, still appears here, just flagged
  (`dismissed`/`notifications_off`/`mounted`) rather than hidden. Ordered
  due-before-warning, then by `Result#fraction_used` (new, cheap arithmetic over
  numbers the status computation already has) descending.
- **`recent_rides`** — every activity in a rolling 14-day window (not
  calendar-day-sensitive, so no `tz` needed) plus `summary: {count, distance_meters}`.
  Each ride's `counted_toward` (which components its mileage counts toward) comes
  from `Maintenance::CountedTowardQuery.call(user, since:)`
  (`app/services/maintenance/counted_toward_query.rb`) — one batched SQL query
  (`strava_activities` ⨝ `component_assignments` ⨝ `components` on `bike_id` + the
  assignment window + ride_context) for the whole window at once, the same
  batching precedent as `Maintenance::BatchedDistanceQuery`. `indoor` comes from
  the new `StravaActivity#indoor?` instance method (mirrors the `.indoor`/`.outdoor`
  scopes for one already-loaded record). `gear_id` rides alongside a `null` bike
  specifically so the frontend can offer "Link Strava gear" only for the
  fixable-via-gear-mapping case, same distinction as `sync.unattributed.with_gear`.

**`Maintenance::RideContextSql.predicate(assignment_alias:, activity_alias:)`**
(`app/services/maintenance/ride_context_sql.rb`) is the one shared SQL fragment
behind every batched ride_context filter — extracted from
`BatchedDistanceQuery`'s inline SQL, and the second caller is
`CountedTowardQuery` above. It has to stay bit-for-bit equivalent to
`StravaActivity.indoor`/`.outdoor` (used by `ComponentAssignment#activities_from`,
the Ruby-level windowing primitive every per-component mileage computation funnels
through) — `IS DISTINCT FROM`, not `where.not`, specifically for NULL-safety parity.
Each batched query that uses it carries its own parity spec proving this (see
`spec/services/maintenance/counted_toward_query_spec.rb`'s split indoor/outdoor
cassette-slot case) rather than trusting it by inspection alone.

**`tz` query param**: `GET /dashboard?tz=<IANA zone name>` is the app's first
timezone-aware calculation (nothing else in the app has ever needed one —
`config.time_zone` is unset, so the app runs in UTC). The frontend sends
`Intl.DateTimeFormat().resolvedOptions().timeZone`; the backend does
`(ActiveSupport::TimeZone[tz] if tz.present?) || Time.zone` to compute the current
calendar month's boundary (for `distance_this_month`) in the viewer's zone, then
converts to UTC for the actual query range. Nothing is persisted — if more of the
app ever needs a real per-user timezone, that's a `User#time_zone` column, a
genuine data-model change deliberately not made speculatively here. **Flagged for
the project plan doc** per this file's own convention, since it's a new pattern,
not just a new feature.

**Frontend**: `Dashboard.tsx` owns the one `useDashboard(tz)` query and the
"Sync now" polling loop — `POST /strava/sync` only enqueues `StravaSyncJob`, so
after a click it polls `GET /dashboard` every 2s (capped at 30s) until
`sync.last_synced_at` changes, then invalidates `['maintenance_alerts']` too.
`components/dashboard/`: `SyncStrip` (connection state, relative + absolute last
sync via the new `formatRelativeTime` in `utils/datetime.ts`, the unattributed
breakdown), `BikeCards`/`BikeCard`, `NeedsAttention`/`AttentionRow` (grouped by
bike, "Not mounted" last; Log service reuses `MaintenanceEventFormModal` as-is),
`RecentRidesTable`. The latter is a plain Mantine `Table` in a horizontal-scroll
wrapper, **not** the sortable/configurable-table system above — that mechanism
exists for a `TableViewPreference` row's worth of persisted column
choices/ordering, which this fixed, non-configurable 14-day feed has no use for.
`formatRemaining` (the "N km left"/"N km overdue" wording) was extracted out of
`ServiceIntervalsSection.tsx` into `utils/serviceInterval.ts` so `AttentionRow`
shares the exact same wording rather than re-deriving it.

## Bike setup

Replaces manually repeating "track a slot → create a component → install it" once
per part (~8 times for a typical bike) with one batched step, optionally pre-checked
from a user-editable **bike type** preset.

- `BikeType`: user_id, name (unique per `(user_id, lower(name))`, same convention as
  `ServiceType`), default_categories (string array, default `[]`). Modeled on
  `ServiceType`, but `has_many :bikes, dependent: :nullify` instead of
  `restrict_with_error` — nothing is *calculated* from a bike type (it only
  pre-checks the setup checklist), so blocking a delete would just be friction.
  `default_categories=` strips blanks and dedupes, same free-text-no-server-list
  convention as `Component#category` — allowed values come from the frontend
  (baseline categories plus the user's custom ones), never validated against a
  fixed list here. `Users::Provision` seeds Road/Gravel/Mountain/Time Trial/
  Commuter with sensible defaults (Mountain is the one that includes
  front_suspension/rear_suspension/seat_post); a migration backfills the same for existing
  users, same find-or-create-never-overwrite convention as the category backfills
  above. **Editing a type's `default_categories`, or changing which type a bike
  uses, never adds, removes, or touches any slot/component/assignment on any
  existing bike** — there's no `after_save` hook on `Bike#bike_type_id` at all, so
  this is true by construction, not by a check that could drift out of sync.
- `BikeFormModal` gets a clearable "Type" `Select`; `BikeTypesPage.tsx` (a Settings
  tab next to Service Types) is where types are added/renamed/deleted and their
  `default_categories` edited via a `MultiSelect` built from `useAllCategories()`.
  The Bikes list's optional "Type" column resolves the name client-side against the
  already-fetched bike-types list (the `Bike` JSON only carries `bike_type_id`, a
  plain column) — same "resolve an id against an already-fetched list" pattern
  `MappedGearRow` uses for bike names on the Strava page.
- **`POST /bikes/:id/component_setup`** (`{ installed_on, components: [{ category,
  ride_context, label, brand, model, notes }, ...] }`) creates a `BikeComponentSlot`
  + `Component` + `ComponentAssignment` per row, all in one transaction — any row
  failing validation rolls back everything and responds `422` with `{ row_errors:
  { "<index>": {...errors} } }`, keyed by the row's position in the submitted array
  (not by category), so the form can show each failure inline. Every existing model
  validation applies completely unchanged — a row for a category the bike already
  has a slot for fails honestly on `BikeComponentSlot`'s own uniqueness validation
  rather than being silently skipped or reused, and a split `ride_context` for a
  category that doesn't `allows_multiple_assignments` fails on
  `ride_context_requires_allows_multiple_assignments`, not a check duplicated in the
  controller. Each row's own `ride_context` drives *both* the new slot's and the new
  assignment's `ride_context` (not forced to `"both"`) — this is what lets a category
  that `allows_multiple_assignments` be set up as two rows at once (one
  `outdoor_only`, one `indoor_only`) in the same batch, rather than requiring the
  indoor/outdoor split to be a manual follow-up action on the Bike detail page.
  `installed_on`/a row's `acquired_on` need no date→timestamp conversion — assigning
  a bare date string straight into a timestamp column already casts to midnight UTC
  via Rails' normal attribute typecasting, the same assumption
  `Maintenance::BatchedDistanceQuery`'s `acquired_on::timestamp` cast already relies
  on, so this reuses that convention rather than inventing a new one.
- **`/bikes/:id/setup`** (`BikeSetup.tsx`) is a page, not a step inside
  `BikeFormModal` — the checklist can run to 18 rows. One row per `trackable`
  category from `useAllCategories()` not already fully slotted; a category already
  tracked (every valid `ride_context` for it already has a slot) shows as a
  disabled "Already tracked" row instead of being hidden. A fresh
  `allows_multiple_assignments` category's sole starting row has an editable
  ride-context `Select`; picking `outdoor_only`/`indoor_only` there reveals a
  "+ Add outdoor/indoor too" action that appends the complementary row (context
  fixed, not re-selectable, since `"both"` and a split pairing can't coexist). A
  category with one context already slotted (e.g. `outdoor_only` tracked
  elsewhere) offers only the missing one, pre-labeled with what's already tracked.
  Checked-row fields (label pre-filled `"{bike name} {category label}"`,
  brand/model, notes collapsed by default behind a toggle) and un-checked rows
  render the exact same row height — every input is always rendered, just
  `disabled` when unchecked, instead of appearing/disappearing, so toggling a
  checkbox never reflows the table. One shared "Installed since" `DateInput`
  (default `bike.acquired_on`, else today) applies to every checked row; its helper
  text calls out that Strava rides before that date won't count toward these
  components (existing attribution behavior, not new logic — see "Core logic"
  above). "Check all"/"Clear all" and "Skip for now" (navigates to `/bikes/:id`
  with no request sent, leaving the bike exactly as-is) round it out.
- `BikeFormModal` gained an `onCreateSuccess?: (bike: Bike) => void` prop (same
  pattern as `ComponentFormModal`'s own, fired only on a successful *create*, never
  edit). Only the Bikes page's main "+ New Bike" button passes
  `onCreateSuccess={(bike) => navigate(\`/bikes/${bike.id}/setup\`)}` — the Strava
  page's two other bike-creation shortcuts ("+ Create new bike" in gear mapping,
  "Track as retired bike") don't pass it, so they keep their existing behavior
  unchanged. `BikeDetail.tsx` also links to the setup page wherever it already shows
  "No component types tracked yet.", for anyone who skipped and wants to come back.

## Brand/model autocomplete

`Component#brand`/`#model` stay free text (a user can always type a value that
isn't suggested) — Mantine `Autocomplete`, never `Select`. Every surface that
creates or edits a component's brand/model goes through one shared component,
`frontend/src/components/ComponentBrandModelInputs.tsx`, so the rules below live in
exactly one place: `ComponentFormModal.tsx` (create/edit, `layout="stacked"`) and
`BikeSetup.tsx`'s per-row "Brand / Model" column (`layout="inline"`, one merged
table cell per row, not two).

- **Sources**: the user's own components, via the existing `useComponents()` query
  (no new endpoint — it already returns every component including retired ones
  with `brand`/`model`/`category`, and every component mutation already
  invalidates `['components']`, so suggestions stay current for free); plus
  `ComponentCategorySetting#common_brands` for whichever category is currently
  selected — per-category and user-editable (see the data model above), not a
  hardcoded frontend constant, so a chain never suggests a tire brand and vice
  versa. `common_brands` isn't just the seeded/edited list — saving a component
  with a brand not already there appends it (see the data model above), so
  "Common brands" also grows from the user's own history even after the
  originating component is deleted; add-only, and a brand removed on the Settings
  page comes back if a component using it is saved again. No built-in model list —
  models only ever come from the user's own data.
  `frontend/src/hooks/useComponentSuggestions.ts` wraps the `useComponents()` query
  into `{ brands, models }` (distinct, case-insensitively grouped, with counts),
  and takes an optional `extra` array to merge in not-yet-saved values — `BikeSetup`
  passes every other checklist row's current brand/model/category (memoized over
  its row state), so typing "SRAM" in one row suggests it in another before either
  saves.
- **Ranking** (`frontend/src/utils/componentSuggestions.ts`, plain functions, no
  frontend test runner exists in this project so these aren't unit-tested yet, but
  are isolated so they're a drop-in addition later): brand suggestions group into
  "Your brands" (usage count descending, then alphabetical) and "Common brands"
  (the current category's `common_brands` minus anything already in the first
  group, case-insensitively, alphabetical — empty, and the group simply omitted,
  when no category is known yet or the category has no seeded/added brands).
  Model suggestions filter to the brand currently typed (any category), or to the
  current category if brand is empty; within that, a category match ranks first,
  then usage count. Picking a model suggestion fills in its brand too, but only
  when the brand field is still empty. Mantine's own default `Autocomplete`
  filtering already does case-insensitive "anywhere in the string" matching and
  (via `limit={10}`) caps the dropdown, across grouped data — no custom filter
  function needed for that part.
- **Casing**: on blur, the typed value is trimmed and, if it matches a suggestion
  case-insensitively, replaced with that suggestion's exact casing
  (`resolveCasing`) — models compare only against models of the matching brand.
  This is deliberately a frontend-only nudge, not a server-side rule — `Component`'s
  `normalizes` (see the data model above) only squishes whitespace, it never
  touches case, so two differently-cased spellings of the same brand can still
  exist in the database; this feature's whole point is to stop *new* entries from
  adding to that drift, not to repair old ones (no backfill, by design, same as the
  `normalizes` change itself).

## Build order (work one phase at a time; don't jump ahead)

1. Skeleton — done once this file exists and `rails db:create` works.
2. Core CRUD — Bike, Component, ComponentAssignment, MaintenanceEvent models +
   JSON REST controllers (index/show/create/update/destroy), consumed by the
   separate Vite frontend. Done. `Component#show` returns `total_distance`
   (and, since Phase 4, each service interval's computed status).
3. Strava OAuth + activity sync + gear-to-bike mapping. Done, with one
   intentional deferral: sync is manually triggered for now (`bin/rails
   strava:sync_all` is ready for a future scheduler once the app is deployed).
   Also delivered here, ahead of schedule: a `User` model and `user_id` ownership
   on `Bike`/`Component`/`StravaActivity`/`StravaCredential`, so the app was
   shaped for real multi-user login later without another retrofit migration —
   `current_user` was a placeholder (`User.first!`) until real authentication
   landed in Phase 5 (see "Authentication" above).
4. Attribution dashboard (frontend) — surface total distance, distance since
   last maintenance event, and simple threshold alerts using the API from
   Phase 2/3. Done — delivered as the full service-types/intervals/notifications/
   dismissals system in "Service intervals and maintenance alerts" above, not just
   a bare threshold check. One intentional deferral carried over, same root cause
   as Phase 3's: sync is still manual, so a dismissed alert only clears on the next
   "Sync now" press (see that section's "Known limitation").
5. Polish — deploy, webhooks, charts. **<- current phase** (notifications,
   originally slated here, shipped early as part of Phase 4 instead.)
   Real authentication (email/password + Strava sign-in, with Google
   deferred pending real OAuth credentials) shipped here too — see
   "Authentication" above. The landing-page dashboard (sync status, per-bike
   mounted/off-bike components, a needs-attention list, recent rides) shipped
   here too — see "Dashboard" above. Bike types and the batched component setup
   step, plus six new component categories and bike/component fields (purchase
   date, brand/model/notes), shipped here too — see "Bike setup" above. Brand/model
   autocomplete (suggestions from the user's own saved components plus a
   per-category, user-editable `common_brands` list, later made front/rear-paired —
   e.g. `tire_front`/`tire_rear` — and self-learning from every component save)
   shipped here too — see "Brand/model autocomplete" above. The `shock` category
   was retired in favor of `rear_suspension`, paired with `front_suspension` the
   same way. Deploy, webhooks, and charts remain.

## Conventions

- Write model specs (RSpec) alongside every model.
- Commit after each working increment.
- Date/time column naming: `_at` for datetime columns, `_on` for date-only columns.
  Keep this consistent for any new column — if a column gains a time component, rename
  it to `_at` in the same migration. Current date-only columns: `bikes.retired_on`,
  `components.acquired_on`, `components.retired_on`.
- Logic that isn't a model or controller lives in `app/services/`, namespaced per
  integration (e.g. `Strava::Client`). Zeitwerk autoloads it with no config change.
- If a change here affects the data model or architecture, flag it back to the project
  plan doc rather than only updating this file.
