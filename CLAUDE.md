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
- `MaintenanceEvent`: component_id, service_type_id, performed_at (timestamp), notes,
  service_session_id (nullable FK — see "Batch service logging" below). Reachable
  from a `User` via `has_many through:` on `components` — no direct `user_id` column
  of its own. Logging one is what resets a service interval's baseline (see "Service
  intervals and maintenance alerts" below) — nothing is stored as a counter; progress
  is always computed from event history. An event logged one at a time
  (`ComponentDetail`, the Dashboard's single-component "Log service") has
  `service_session_id: nil`, exactly as before this feature existed — only
  `ServiceSessionsController#create`'s batch path ever sets it. Once set, the
  event's own `performed_at` can't be edited directly (`on: :update` validation,
  so creating it alongside the session is unaffected) — it always matches its
  session's date, which only moves by editing the session itself. Destroying an
  event whose session has no other events left destroys that session too
  (`after_destroy`), so a session is never left empty.
- `ServiceSession`: user_id, bike_id, performed_at (timestamp), notes (nullable).
  Groups `MaintenanceEvent`s logged together on one bike in one batch (see "Batch
  service logging" below) — `validates :bike_id`'s owner matches `user_id`.
  Changing its own `performed_at` cascades to every one of its events via
  `update_all` in the same request (bypassing their own validation deliberately,
  the one legitimate way an event's date moves after creation) — not a separate
  endpoint call per event. `FUTURE_TOLERANCE` (5 minutes, same order of magnitude
  as `StravaCredential::REFRESH_BUFFER`) is the only place a future `performed_at`
  is rejected in this app; plain single-event `MaintenanceEvent` logging has no
  such check and is unchanged. Deleting a session deletes its events
  (`dependent: :destroy`). Deliberately no "remove one event from its session" —
  delete the event (which, per the rule above, deletes an emptied session too)
  and re-log it instead; one less concept for the same result.
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
  also counts as indoor regardless of `trainer`. Also carries ride-analytics fields,
  now surfaced on the Bike detail page's Ride history table (see "Ride history"
  below): `trainer`, `commute`, `moving_time`, `elapsed_time`, `average_speed`,
  `max_speed`, `total_elevation_gain`, `average_watts`, `weighted_average_watts`,
  `device_watts`, `kilojoules`, `average_heartrate`, `max_heartrate`,
  `average_cadence` — all nullable except `trainer`/`commute`, since Strava omits
  them entirely (not even `null`) when an activity has no power meter/HR
  monitor/cadence sensor. `#ride_kind` (`"outdoor"`/`"trainer"`/`"virtual"`) is the
  one server-derived classification backing that table's Type column — `"trainer"`
  and `"virtual"` together are exactly `#indoor?`, so the frontend never
  re-implements the indoor rule itself. `ignored_at` (nullable datetime) is a
  user's explicit "don't track this ride" decision, mirroring `StravaGear#ignored_at`'s
  shape but with no resurfacing concept — a ride's own data never changes after
  sync, so there's no later signal to resurface against (see "Strava integration"
  below). A validation (`not_ignored_while_attributed`) rejects `ignored_at` set
  while `bike_id` is present — a ride can only be ignored while unattributed, and
  `ignored_at` is never written from Strava's own data (there is none). Because
  `StravaActivity.reconcile_for_bike!` attributes via `update_all`, outside the
  validation's normal path, it clears `ignored_at` explicitly in that same
  statement wherever it sets `bike_id` to a real value; every *other* write path
  that can newly attribute a ride (sync, full refresh, single/bulk resync — see
  "Strava integration" below) goes through `Strava::ActivityUpsert`, the one
  shared place that applies the same rule (`attrs[:ignored_at] = nil if
  bike.present?`) — the validation itself exists to reject an invalid *write*,
  not to clean one up after the fact, so every writer still has to clear it
  deliberately. `.ignored`/`.not_ignored` scopes split on the column directly;
  `.needs_attention_for`/`.ignored_for` (class methods, same shape as
  `StravaGear.unmapped_for`/`.ignored_for`) are the shared definition of "needs
  attention" vs. "ignored" among a user's unattributed rides, factoring in
  gear-level ignores too (an unattributed ride whose gear is ignored counts as
  ignored, not needing attention) — every caller (`Dashboard::Summary`,
  `Strava::RideLog`, `StravaController#ignore_rides`'s `all_matching` branch, see
  below) goes through these rather than re-deriving the classification.
  `#attribution_status`/`#reason` are the per-row instance-method versions of the
  same classification, used once a batch of rides is already loaded (checking
  `ignored_at` before the gear-ignore check, so a ride that's both individually
  ignored and on ignored gear reports `"ride"`).
- `StravaCredential`: user_id (unique — one row per user), access_token, refresh_token,
  expires_at, athlete_id (also unique — one Strava athlete can't be attached to two
  different app accounts; the identity-linking rules in "Authentication" below are
  what makes this safe now that Strava is also a sign-in method, not just a data
  connection), scope, last_synced_at (nullable datetime). The latter is set
  at the end of every `StravaSyncJob#perform`, including a run that finds no new
  activities — the only "last completed sync" signal in the app (the incremental sync
  cursor itself is still just `StravaActivity.maximum(:moved_at)`, unrelated). It's
  what a `ServiceAlertDismissal` compares against to decide whether it's expired.
  Also carries `last_full_sync_at` (nullable datetime, set only at the end of a
  completed *full* refresh — see "Strava integration" below) and
  `full_sync_started_at` (nullable datetime, a short-lived lock set right before
  enqueuing a full refresh and cleared in the job's `ensure`, so a crashed job still
  releases it). `#full_sync_available_at`/`#full_sync_available?` resolve both a
  15-minute post-completion cooldown (`FULL_SYNC_COOLDOWN`) and a 10-minute
  running-lock staleness fallback (`RUNNING_TIMEOUT`, in case the `ensure` never
  fires) into a single "available again at" timestamp or `nil`.
  `#full_sync_request_estimate` is roughly how many Strava API calls a full
  refresh would cost right now — `ceil(rides / 100) + 2 + gear` (rides/gear
  counted fresh from the DB each call, not cached) — used to decide whether
  resyncing a bulk selection of rides one by one or running a full refresh is
  cheaper (see "Strava rate limits" below). Also carries `last_sync_failed_at`
  (datetime), `last_sync_error` (string — a category code: `"rate_limited"`/
  `"strava_unavailable"`/`"auth_failed"`/`"unknown"`, never the raw exception
  message), `last_sync_failed_kind` (`"full"`/`"incremental"`), and
  `last_sync_retry_at` (datetime, only ever set alongside `"rate_limited"`) —
  set by `StravaSyncJob` when a run raises, cleared on the next successful run
  of either kind. These are how a failed sync stops failing silently; see
  "Strava integration" below.
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
  banners.
- API: `ServiceTypesController`, `CategoryServiceIntervalsController` (plus `POST
  .../:id/apply`), `ComponentServiceIntervalsController` (plus `POST
  .../apply_defaults`), `NotificationSettingsController` (singleton, upsert like
  `TableViewPreference`), `MaintenanceAlertsController#index` (`GET
  /maintenance_alerts`, banner-eligible statuses only), `ServiceAlertDismissalsController`
  (`#create`, `#dismiss_all` with an optional `status` param). Both the index and
  `dismiss_all` take optional `bike_id`/`component_id` filters, applied *after*
  banner-eligibility, via the one shared
  `Maintenance::IntervalStatus.banner_eligible_for_user(user, bike_id:, component_id:)` —
  so a scoped banner's "dismiss all" can never touch anything the matching index
  call didn't itself show. Unscoped (every alert at once) still works for backwards
  compatibility, but the frontend never calls either endpoint that way now — see
  below. Every alert also carries `bike_ids`: every bike the component currently has
  an active (`ended_at: nil`) assignment on — usually one, but a category with
  `allows_multiple_assignments` can have the same component mounted `indoor_only` on
  two bikes at once, and that alert belongs on both bikes' pages, unfiltered by
  whichever `bike_id` the request happened to scope to. `ComponentsController#show`
  includes every enabled interval's full computed status; `ComponentsController#index`
  and `BikesController#show` (per installed component) include just the batched
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
  the page) each item reads just `"{service type} — {status}"` rather than
  repeating the component label, and the banner title counts services rather than
  components, since every item there is already the one known component; on
  `BikeDetail` both stay `"{component label} — {service type}"` and the
  components-count title, unchanged from before this scoping existed.
  `frontend/src/components/ServiceIntervalsSection.tsx` (rendered
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
  computation — `Dashboard::Summary#off_bike_components_by_bike` is now a
  one-line delegate to this at its default `at:`, rather than keeping a second,
  separate "now"-only implementation. A component retired on the same calendar
  day as `at` still excludes correctly (compares `retired_on` cast to a
  timestamp against `at`, not a bare date, specifically so a same-day
  retirement reads as "before" any later moment that day) — this is what keeps
  the Dashboard's own output unchanged, not just approximately equivalent.
- **`GET /bikes/:id/serviceable_components?at=<iso8601>`** (`BikesController`,
  same home as the existing `:rides` member action) returns `{ mounted: [...],
  off_bike: [...] }`, each component with its **enabled** service intervals
  (`Maintenance::IntervalStatus.for_user`, batched once per request — never
  per component) carrying `service_type_id`/`service_type_name`, `status`,
  `driving_dimension`, `distance_remaining_meters`/`days_remaining`. That
  status is computed **as of now**, never as of `at` — it exists to help the
  user decide what to check, not to claim what the interval looked like on a
  backdated date, and the UI copy says so.
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
  needs no interval set up on that component (the "Add other" path on a
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
  group, one row per enabled interval (checkbox, service type,
  `ServiceStatusBadge`, `formatRemaining` — both reused as-is, not
  reimplemented), a "Select all due and warning" shortcut, and "Add other…"
  rows (a component picker from the same eligible list plus
  `ServiceTypeSelect`/`useServiceTypeIdResolver`, the exact pieces
  `MaintenanceEventFormModal` already uses) for a service with no interval.
  Takes an optional `initialPerformedAt` prop — unused by `BikeDetail`'s header
  "Log service" button and the Dashboard `BikeCard`'s own "Log service" action, but
  used by the Activity log's "Log service after this ride" row action (see
  "Activity log" below), which passes a ride's `moved_at + elapsed_time`.
  Mutations (`useCreateServiceSession`/`useUpdateServiceSession`/
  `useDeleteServiceSession`) invalidate the `history` and `serviceStatus`
  groups, same as single-event "Log service" (see "Cache invalidation" under
  Conventions).
- **Showing a session**: `ComponentServiceAndHistory`'s history table marks
  any event with `service_session_id` set with a small "Part of a service
  session · N items" control (N counts every event in the session, not just
  this component's own — a session can span several components on one bike),
  opening `ServiceSessionViewModal` (date, note, every event, Edit
  date/note, Delete session via `confirmDelete` naming the event count).
  `MaintenanceEventFormModal`'s date field is `disabled` with explanatory text
  whenever the event being edited is session-bound, matching the backend
  validation up front rather than only surfacing it as a 422 after the fact.

**Flagged for the project plan doc** per this file's own convention: the new
`service_sessions` table and `maintenance_events.service_session_id`.

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
  token expiry) and persists Strava's rotated refresh_token — if Strava rejects the
  refresh (a revoked/invalid refresh_token) with a 400/401, this raises
  `Strava::Client::AuthenticationError` rather than the generic `Error` (see
  `StravaSyncJob`'s failure recording below). `client_id`/`client_secret`
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
  `SYNCED_TYPES`; safe to run repeatedly. Every row's actual write goes through
  `Strava::ActivityUpsert.call(user:, activity:, raw:, bike:)` — the one place a raw
  Strava payload gets applied to a `StravaActivity`, including the
  attribution-clears-`ignored_at` rule (see the data model above). The job itself
  only resolves `activity`/`bike` from two hashes preloaded *once per run*
  (`bikes_by_gear_id`, `activities_by_strava_id`) rather than querying per row — the
  dominant cost on a full resync's thousands of rows, fixed after profiling a real
  run; `StravaController#resync_ride`/`#resync_rides` (below) resolve the same two
  values per row instead (there's only ever one or a handful of rows), but call the
  exact same `Strava::ActivityUpsert`, so the two paths can never drift on
  attribution rules. `bin/rails strava:resync_all` runs a full resync for every
  connected user. Paging is capped at `MAX_PAGES = 50` (5,000 rides) for an
  incremental sync, or `FULL_SYNC_MAX_PAGES = 200` (20,000 rides) for a full resync —
  a full history fetch is far more likely to need more pages than an incremental one
  ever does (see "Strava rate limits" below for why 200 pages is still not always
  enough to finish in one go).
- **Full refresh**: `POST /strava/sync` with `{ full: true }` is the one user-triggered
  way to pick up rides edited, moved to different gear, or deleted on Strava after the
  fact — the incremental cursor only ever looks forward, so it can never see those
  changes. Gated by `StravaCredential#full_sync_available_at` (a 15-minute post-completion
  cooldown plus a 10-minute running-lock staleness fallback — see the data model above);
  blocked, the endpoint responds `429` with `{ retry_at: }` and enqueues nothing.
  Surfaced on the frontend as a "Refresh all rides" button next to "Sync now" on the
  `/strava` page, disabled during the cooldown with the available-again time shown.
  `StravaSyncJob#perform(user_id, full_resync: true)` additionally **reconciles**: it
  tracks every `strava_id` seen whose `type` is in `SYNCED_TYPES` while paging (a ride
  that changed to an excluded type, e.g. "Run", is simply never added to this set —
  indistinguishable from a deleted one, which is exactly the behavior wanted), then after
  paging finishes *without raising* — the failure-recording `rescue` below still
  re-raises every error after recording it, so an error during paging means
  reconciliation is never reached, by construction, same as before that `rescue`
  existed — applies guards in order: paging hit the page cap → skip the delete entirely (the "did
  we see everything" guarantee is void) but still record `last_full_sync_at`; paging
  ended naturally but found zero activities while local rows exist → log a warning and
  skip the delete (a suspiciously empty response, not trusted); otherwise →
  `user.strava_activities.where.not(strava_id: seen_strava_ids.to_a).delete_all` (plain
  `delete_all`, no callbacks need to run — nothing else in the schema references a
  `strava_activities.id`) and log the deleted count. **Deleting a reconciled-away ride
  changes bike/component mileage and interval statuses retroactively — this is intended,
  matching Strava, not a gap.** `full_sync_started_at` is set by the controller right
  before enqueuing and cleared by the job in an `ensure`, so a crashed job still releases
  the lock (the staleness fallback above covers the case where even the `ensure` never
  ran, e.g. a killed worker process). `GET /strava/status` exposes
  `last_full_sync_at`/`full_sync_available_at`/`full_sync_request_estimate` (data
  model above) and `max_bulk_resync` (below) alongside the existing incremental
  fields, plus the four failure columns described below.

  **Failed syncs are recorded, not silent**: `StravaSyncJob#perform` wraps each
  run (incremental and full both) in a `rescue StandardError => e;
  record_failure(credential, e, kind:); raise` — it still re-raises (the job
  must keep reporting as failed to whatever runs it), but first stores a
  category on the credential via `update_columns` (bypasses validations, so
  recording a failure can't itself fail to save): `"rate_limited"` for a
  `Strava::Client::RateLimitedError`, `"auth_failed"` for an
  `AuthenticationError` (the OAuth token endpoint rejecting a revoked/invalid
  refresh_token — see "Strava rate limits" below), `"strava_unavailable"` for
  any other `Strava::Client::Error` or a Faraday timeout/connection failure,
  `"unknown"` otherwise. A rate-limited failure also stores `last_sync_retry_at`
  from the error's own `retry_at`. For the full path, this `rescue` runs (and
  records) *before* the pre-existing `ensure` that clears
  `full_sync_started_at` — Ruby runs `ensure` as the exception continues
  propagating out of the `begin` block, so the lock release is unaffected. A
  successful run (either kind) clears all four failure columns in the same
  `credential.update!` call that already sets `last_synced_at`/
  `last_full_sync_at`. Because `last_full_sync_at` is only ever set on that same
  success path — never reached if the run raised — a failed full refresh can't
  start the 15-minute cooldown, by construction. See `useStravaSyncRunner`
  below for how the frontend surfaces this.
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
- **Ride-level ignore and the Rides tab**: the `/strava` page is two Mantine `Tabs`
  (`?tab=gear` default, `?tab=rides`) — Gear is the section above, unchanged; Rides is
  `GET /strava/rides` (`Strava::RideLog`, plain ActiveRecord `where`/`order`/`offset`/
  `limit` over `StravaActivity.needs_attention_for`/`.ignored_for`/unfiltered — no raw
  SQL needed, unlike `Bikes::RideHistory`, since this list has no per-bike odometer to
  compute), filterable by `status` (`attention`/`ignored`/`all`, default `attention`),
  `bike_id` (only applied for `all`), sorted by `date`/`distance`. Each ride's
  `attribution`/`reason` (from `StravaActivity#attribution_status`/`#reason`, see the
  data model above) drives a status badge and which row action shows: ignore (needs
  attention), un-ignore (ignored by its own `ignored_at`, never offered for a
  gear-ignored row — there's nothing on the ride itself to un-set), or "Resolve gear"
  (an `unmapped_gear` row, linking to `?tab=gear&gear=<id>` — the Gear tab's matching
  Unmapped gear row scrolls to and briefly highlights itself on mount when that param
  is present). `POST /strava/rides/ignore` (by `activity_ids` or `all_matching: true`
  — the latter always resolves against `needs_attention_for` server-side) and `POST
  /strava/rides/unignore` both silently skip ineligible ids rather than erroring,
  matching the gear-ignore flow's "no confirm modal, fully reversible" philosophy. The
  Rides tab adopts the sortable/configurable-table system as its eighth table
  (`strava_rides`, see "Sortable, configurable tables" below) with bulk selection
  ("select all N matching" resolved server-side, not limited to loaded rows) layered on
  top; its own `status`/`bike_id`/`sort`/`order` are local ephemeral state, not
  persisted via `TableViewPreference`, same convention as Ride history's own
  `typeFilter`. A tab badge shows the live `attention` count even while the Gear tab is
  active, sourced from the same query the Rides tab itself uses so the two never
  disagree. `app/services/strava/ride_serialization.rb`
  (`Strava::RideSerialization::ATTRIBUTES`/`.base_json`) is the one shared ride-field
  serializer behind both this endpoint and the Bike detail page's own
  `GET /bikes/:id/rides` (see "Ride history" below) — no duplicated attribute list.
  The Dashboard's sync banner and "No bike" recent-ride rows link here too (`?tab=rides`
  for review/ignore, `?tab=gear` for gear mapping specifically).
- **Single and bulk resync**: a full refresh is the only way to pick up a Strava
  edit, but it costs `full_sync_request_estimate` calls regardless of how small
  the actual fix was — too slow for "I fixed the gear on one ride." `POST
  /strava/rides/:id/resync` re-fetches that one activity (`GET
  /activities/{id}`, one call) and runs it through `Strava::ActivityUpsert`
  exactly like the sync job does; a 404, or a type that's since changed to
  something `SYNCED_TYPES` excludes, deletes the local row — the same
  "indistinguishable from deleted" rule full-refresh reconciliation already
  uses. `POST /strava/rides/resync` (`{ activity_ids: [...] }`) is the bulk
  companion backing the Rides tab's "Needs attention" selection toolbar's
  "Resync selected" — `StravaController::MAX_BULK_RESYNC` (25) is a hard cap
  (`422` above it, not a silent truncation — a real request should never hit
  this; see the frontend routing below) on top of refreshing the access token
  once up front rather than once per row. Both actions deliberately skip
  `last_synced_at`/`last_full_sync_at`/`Strava::GearSync#call` — this is a
  standalone action, not a sync cycle — but each one **does** backfill
  `StravaGear` for any gear_id it doesn't already have cached (a bike added on
  Strava since the last sync), via the new `Strava::GearSync#sync_gear(gear_id)`
  (`StravaController#sync_uncached_gear`, one fetch per distinct new gear id
  even across a whole bulk batch, not per ride) — without this, a resynced ride
  could carry a gear_id the Gear tab and the Rides tab's own Gear column had
  never heard of, until the next full/incremental sync. See "Strava rate
  limits" below for the stop-on-rate-limit behavior both actions share, and why
  bulk resync has no `all_matching` variant the way ignore does.

  **Frontend routing**: the Rides tab computes `threshold = min(max_bulk_resync,
  full_sync_request_estimate)` from `GET /strava/status`. A selection at or
  under that threshold shows "Resync selected" as always; a larger selection,
  or "select all N matching" (which has no bounded id list to resync
  individually at all), shows "Refresh all rides" instead, with a dimmed line
  spelling out the call-count tradeoff. That button fires the *same*
  `useStravaSyncRunner({ full: true })` instance the Strava page header already
  owns — `Strava.tsx` passes it down to `RidesTab` as a `fullSync` prop (the
  same lift-state-as-props pattern `Dashboard.tsx` already uses for
  `SyncStrip`) rather than the tab running a second independent poller for the
  same action.
- **Strava rate limits**: Strava's defaults are 100 read requests per 15
  minutes / 1,000 per day, and 200/2,000 overall; a request rejected for the
  15-minute limit still counts toward the daily one. The 15-minute window
  resets at `:00`/`:15`/`:30`/`:45` UTC. Every response carries
  `X-ReadRateLimit-Limit`/`-Usage` and `X-RateLimit-Limit`/`-Usage`, each a
  `"<15min>,<daily>"` pair — `Strava::Client` parses both on a 429 into
  `RateLimitedError#read_limit`/`#read_usage`/`#overall_limit`/`#overall_usage`,
  plus `#retry_at` (the next window boundary, computed from `Time.current`, not
  parsed from a header Strava doesn't send). Per-action cost, as the code
  stands: a single resync is 1 call; bulk resync of *k* rows is *k* calls (plus
  one gear-fetch call per distinct new gear id); a full refresh is roughly
  `ceil(rides / 100)` listing pages + 1 empty final page + 1 `GearSync`
  `fetch_athlete` call + 1 `fetch_gear` call per distinct gear
  (`full_sync_request_estimate`'s own formula). Resyncing *k* rows one by one
  only beats a full refresh while *k* is smaller than that estimate — the
  break-even depends on the user's own history size, which is why it's
  computed (`full_sync_request_estimate`), never hardcoded.
  `FULL_SYNC_MAX_PAGES` (200) itself can exceed one 15-minute read window — a
  history over roughly 9,000 rides can't finish a full refresh in a single
  window. It fails safely in that case: `StravaSyncJob` hits the
  `RateLimitedError` mid-page, so (per the no-rescue-reaches-reconciliation
  design above) nothing gets reconciled/deleted, and the failure is recorded as
  `"rate_limited"` with `last_sync_retry_at` set, same as any other failure.
  **Stop-on-rate-limit in resync**: an ordinary `Strava::Client::Error` (5xx/
  timeout) on one row of a bulk resync is counted as `failed_count` and the
  batch continues — partial progress beats an all-or-nothing retry on a
  transient blip. A `RateLimitedError` is different: every remaining call would
  fail too and still count against the daily limit, so `resync_rides` stops the
  batch immediately instead, reporting `not_attempted_count` and `retry_at`
  alongside whatever counts it had so far (a `200`, not an error — the rows
  before it still committed). `resync_ride` (single) responds `429` with
  `retry_at` for the same case, instead of the generic `502` any other
  `Strava::Client::Error` gets.

  **Flagged for the project plan doc** per this file's own convention: two
  rounds of data-model changes landed here without a doc update at the time —
  `strava_activities.ignored_at` and `strava_credentials.last_full_sync_at`/
  `full_sync_started_at` from the Rides-tab/full-refresh round, plus this
  round's `strava_credentials.last_sync_failed_at`/`last_sync_error`/
  `last_sync_failed_kind`/`last_sync_retry_at`.
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
on nine tables: the Bikes list, the Bike detail page's Installed components,
History, and Ride history tables, the Strava page's Rides tab, the Activity log,
and the Components/Maintenance Events/Assignments lists (each its own `table_key`:
`bikes`, `bike_installed_components`, `bike_history`, `bike_rides`,
`strava_rides`, `activity_log`, `components`, `maintenance_events`, `assignments`).
A future page can adopt the same UX without rework:
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
  change. An optional `extraData` getter lets a page keep one more piece of state in
  the same `TableViewPreference` row alongside columns/sort, spread into every save
  the hook makes so toggling a column never silently drops it (a `PATCH` replaces the
  whole `data` value, no deep merge) — the Activity log's persisted kind-chip
  selection is the only user of this so far; every other adopter omits it.
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
  `DraggableHeaderCell`'s `sortable` prop (default `true`) renders the label as
  plain, non-clickable text when `false` — for a table like `bike_rides` whose
  configurable columns are drag-to-reorder only, never click-to-sort (see "Ride
  history" below).
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
  `StravaActivity.needs_attention_for(user)` into `with_gear` (fixable via gear
  mapping) vs `without_gear` (Strava itself had no bike set), and
  `unmapped_gear_count` from `StravaGear.unmapped_for(user)` (promoted from a
  `StravaController#unmapped_gear`-private query to a model class method — that
  controller action now calls the same method, output unchanged). `needs_attention_for`
  (see the `StravaActivity` data model bullet and "Strava integration" above) is the
  one shared definition of "unattributed and not ignored" — a ride whose gear is
  ignored (and hasn't resurfaced), or that's individually ignored, is excluded from
  `unattributed`/`with_gear` entirely by that scope, same as if it were attributed; a
  no-gear ride is explicitly spared from the gear-ignore exclusion, since a plain
  `NOT IN (...)` isn't NULL-safe on its own. `Strava::RideLog` (the Rides tab's
  endpoint) is the other caller of the same scope — this count and the Rides tab's
  own "Needs attention" count never disagree. Also carries `last_sync_failed_at`/
  `last_sync_error`/`last_sync_retry_at`, straight from the credential (no
  `last_sync_failed_kind` — the sync strip shows one generic failure line
  regardless of full vs incremental, leaving that detail to the Strava page's own
  status) — this is what lets the sync strip's failure item survive a page reload
  instead of only ever reflecting `useStravaSyncRunner`'s in-memory, poll-only
  failure (see "Frontend" below).
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

**Frontend**: `Dashboard.tsx` owns the one `useDashboard(tz)` query plus a
`useStravaSyncRunner({ full: false })` for its "Sync now" button — see
`useStravaSyncRunner` below for what that hook actually does (it replaced an
earlier, Dashboard-only hand-rolled polling loop against `GET /dashboard`
itself; polling now goes through `GET /strava/status` instead, shared with the
Strava page). `components/dashboard/`:

- **`SyncStrip`** is the single place Strava-related issues surface on the
  dashboard — one `Paper withBorder`, never a stack of full-width `Alert`
  boxes. Row 1 (always shown): a badge summarizing the worst current state,
  the connection/last-synced/ride-total line, and "Sync now" (or "Connect
  Strava" when `!sync.connected`, reusing the exact same strip shape rather
  than a separate disconnected-state component). Badge priority, highest
  first: a sync in progress (`syncing` or `stillRunning`) → gray "Syncing…";
  else a failure (`resolveFailure`, below) → red "Sync failed"; else any
  ride/gear issue → orange "Needs attention"; else teal "Connected". Row 2
  (only rendered when there's at least one item): a `Divider`, then a tight
  one-line-per-issue list, each with a small colored dot, one sentence, and
  its own action `Anchor` — sync failure (`syncFailureMessage`, "Reconnect
  Strava" for `auth_failed` only), still running (no action), unmapped gear
  ("Link gear" → `/strava?tab=gear`), no-bike-on-Strava rides ("Review rides"
  → `/strava?tab=rides`) — in that order, and any combination can appear at
  once (e.g. a failure *and* an unmapped-gear item). The detailed "map it,
  track it as retired, or don't track it" guidance that used to live in this
  box moved to where the user actually acts on it: a one-line hint above the
  Gear tab's Unmapped gear table, and one appended to the Rides tab's own
  hint text on its "Needs attention" view (see "Strava integration" below)
  — the dashboard only ever surfaces that something needs attention and
  links to where to fix it.
  **`resolveFailure(sync, liveFailure)`** prefers `useStravaSyncRunner`'s own
  in-memory `failure` (richer: it's from the exact run this page triggered),
  but falls back to the credential's own `last_sync_failed_at`/
  `last_sync_error`/`last_sync_retry_at` (`sync` section above) whenever
  `last_sync_failed_at` is present and not already older than
  `last_synced_at` — this is what lets the failure item survive a page
  reload. No separate "clear" step: once a later sync succeeds,
  `last_synced_at` moves past `last_sync_failed_at` and the function starts
  returning `null` again on its own.
- `BikeCards`/`BikeCard`, `NeedsAttention`/`AttentionRow` (grouped by bike,
  "Not mounted" last; Log service reuses `MaintenanceEventFormModal` as-is),
  `RecentRidesTable` (its "No bike" rows link to `/strava?tab=rides`; its
  "Link Strava gear" link, shown only when `gear_id` is present, to
  `/strava?tab=gear`). `RecentRidesTable` is a plain Mantine `Table` in a
  horizontal-scroll wrapper, **not** the sortable/configurable-table system
  above — that mechanism exists for a `TableViewPreference` row's worth of
  persisted column choices/ordering, which this fixed, non-configurable
  14-day feed has no use for. `formatRemaining` (the "N km left"/"N km
  overdue" wording) was extracted out of `ServiceIntervalsSection.tsx` into
  `utils/serviceInterval.ts` so `AttentionRow` shares the exact same wording
  rather than re-deriving it.

**`useStravaSyncRunner({ full })`** (`frontend/src/hooks/useStravaSyncRunner.ts`)
is the one piece shared by both sync triggers on both pages (Dashboard's "Sync
now"; the Strava page's "Sync now" *and* "Refresh all rides," each its own
instance). `POST /strava/sync` only enqueues `StravaSyncJob`, so after a click
it polls `GET /strava/status` every 2s (capped at 30s for an incremental sync,
3 minutes for `full: true`) watching `last_synced_at`/`last_full_sync_at`
(whichever matches `full`) for a change, *and* `last_sync_failed_at` for a
change whose `last_sync_failed_kind` matches `full ? "full" : "incremental"`
(the kind check matters because the two aren't mutually exclusive — only the
full path is lock-guarded, so an incremental and a full run can be in flight at
once). The hook returns `{ sync, syncing, status, error, failure,
stillRunning }`. A changed timestamp is the only case that invalidates
`RIDE_DATA_GROUPS` (`api/invalidation.ts` — every ride-derived query; the same
set `useResyncRide`/`useResyncRides` and the gear/ride decision mutations use) — never on
`failure`, since nothing was deleted/changed by a run that didn't complete. A
matching failure instead sets `failure: { code, retryAt }`, rendered via the
shared `syncFailureMessage` (`utils/strava.ts`) —
`rate_limited` names the retry time, `auth_failed` pairs with a "Connect to
Strava" action, `strava_unavailable`/`unknown` are plain copy. If the poll cap
is reached with neither a success nor a matching failure, `stillRunning:
true` instead — a neutral "still running in the background" message rather
than just going quiet, which is what happened before this existed.

## Ride history

`GET /bikes/:id/rides` (`Bikes::RideHistory`, `app/services/bikes/ride_history.rb`)
is a bike's rides, paginated (offset-based: `page`/`per_page`, default 50, max
200 — chosen over keyset since this is synced historical data with no realistic
concurrent-insert-during-pagination concern for a personal app), newest first by
default (`order=asc` for oldest first). Each ride carries
`cumulative_distance_meters`: the bike's full odometer — every ride, indoor
included, exactly like `Bike#total_distance` — up to and including that ride,
computed via `SUM(distance_meters) OVER (ORDER BY moved_at, id)` (tie-broken on
`id`) so it's correct on every page regardless of sort direction. The
`type=all|outdoor|indoor` filter is applied *after* that window function, so a
filtered view's odometer values stay the full-bike total, not the filtered
subset's — the frontend's summary line ("N rides · X km") is the filtered
total/count, distinct from any one row's odometer value. A composite index on
`strava_activities (bike_id, moved_at, id)` backs the window function and
pagination's shared ordering. `Maintenance::RideContextSql` gained
`outdoor_predicate`/`indoor_predicate` (extracted out of its existing
`predicate`, composing it unchanged) so this filter and `StravaActivity.outdoor`/
`.indoor` stay one rule, not a third hand-rolled copy; `Maintenance::CountedTowardQuery`
gained optional `bike:`/`activity_ids:` params alongside its existing `since:`,
so a page of rides is covered by one query rather than one per ride (the
Dashboard's own `since:`-only call is unchanged). Each ride's base fields come
from `Strava::RideSerialization.base_json` (`app/services/strava/ride_serialization.rb`)
— the one shared serializer behind this endpoint and the Strava page's
`GET /strava/rides` (see "Strava integration" above), merged with this
endpoint's own `cumulative_distance_meters`/`counted_toward`.

Sorting is deliberately narrower than every other adopter of the
sortable/configurable-table system: the *only* sortable thing is the date order,
driven by the section's own "Newest first"/"Oldest first" toggle, never by
clicking a column header — the point of this view is the sequence, and
client-side column sorting would only reorder the current page, which would
mislead against a server-paginated list. `useTableViewPreferences` needed no
change for this (a page simply never includes its configurable columns in
`sortColumns`); `DraggableHeaderCell` gained the `sortable` prop described above
so those columns don't visually invite clicks they can't act on.

Frontend: `components/bike/RideHistorySection.tsx`, mounted on `BikeDetail.tsx`
directly after Component History, at the same heading level. Adopts the
configurable-table system (`table_key: "bike_rides"`) the same way as `Bikes.tsx`;
`useBikeRides` is a `useInfiniteQuery` (the first in this codebase) with a "Load
more" button (not infinite scroll) plus "Showing N of M". The Name column links
to `https://www.strava.com/activities/{strava_id}` in a new tab, with "View on
Strava" as the tooltip/accessible label per Strava's brand guideline for
API-sourced content — the link uses the `orange` Mantine token (never a hardcoded
hex) rather than this app's own `radar` accent, so it doesn't read as an in-app
action (`components/ride/ViewOnStravaLink.tsx`, extracted so the Strava page's
Rides tab — see "Strava integration" above — can render the same link). `formatSpeed`
(`utils/speed.ts`) matches `formatDistance`'s own hardcoded-km convention (no
metric/imperial setting exists anywhere in this app to plug into). The Avg power
column reuses `formatPower`, dimmed with an "Estimated" tooltip when `device_watts`
is `false`, and renders a literal `'—'` for `null` — distinct from `formatPower`'s
own `'N/A'`, which stays unchanged for the Bike cards that already rely on it
elsewhere. Every column renderer a ride-ish row could share with the Rides tab
(ride-kind badge, distance/duration/elevation/speed/power formatting,
`counted_toward` badges) lives in `components/ride/rideColumnRenderers.tsx`'s
`SHARED_RIDE_COLUMN_RENDERERS`, typed over the fields common to `BikeRide` and
`StravaRide` — this section's own `COLUMN_RENDERER` just spreads that in and adds
its own `cumulative_distance_meters` column.

## Activity log

A bike's whole story in order — rides, the service done between them, and setup
changes — on one timeline, at `/activity`. Rides already showed up on the Dashboard
(14 days), per bike (Ride history), and the Strava page's Rides tab (built for
cleanup, not browsing); maintenance and component swaps were only ever visible per
component. This page is purely for browsing — the Rides tab keeps its own job of
fixing attribution/ignoring, untouched by this feature.

**Four entry kinds** (used everywhere — chips, tooltips, the API's `kind` field):
`ride` (source `strava_activities`), `service_session`/`maintenance_event` (both
UI-labeled "Service" — a session-less event and a batch `ServiceSession` are the
same user-facing bucket), and `setup_change` (source `component_assignments`, one
entry at `started_at` and, when `ended_at` is set, a second at `ended_at`).

- **`Activity::Feed.call(user, **params)`** (`app/services/activity/feed.rb`) has
  two branches, not one mechanism forced to cover both: a keyset-paginated,
  date-ordered default (any combination of kinds), and a separate offset-paginated
  `sort: "distance"` branch restricted to `kinds == ["ride"]` (`422` otherwise,
  `Activity::Feed::InvalidSortError`) — mirroring `Strava::RideLog`'s own
  offset-pagination shape but implemented as its own method here, not a call-through
  (that class has no `q`/date-range/`component_id` support, and the Rides tab stays
  exactly as it is). The date-ordered branch is a raw-SQL `UNION ALL` of up to five
  per-source-kind sub-selects (`ride`, `service_session`, `maintenance_event`,
  `setup_installed`, `setup_removed`), each projecting only
  `(occurred_at, kind, kind_rank, source_id, bike_id)` — the same "raw SQL for
  ordering/ids, then hydrate real AR records" split `Bikes::RideHistory` already
  uses. `kind_rank` (ride=0, service_session/maintenance_event=1, setup_installed/
  setup_removed=2) is the tie-break when `occurred_at` is exactly equal — kept in the
  *same* sort direction as the page's own `order` (not a fixed ascending rank), since
  the keyset `WHERE (occurred_at, kind_rank, source_id) < (...)` tuple comparison
  needs every column compared the same direction to stay correct. A session-less
  `maintenance_event`'s bike isn't a stored column — resolved at `performed_at` via
  a `LEFT JOIN LATERAL` against `component_assignments` (Postgres-specific, same tier
  of raw SQL this codebase already uses for window functions/`IS DISTINCT FROM`) —
  live in the SQL itself, not a post-hydration lookup, since the `bike_id` filter
  needs it too. `component_id` filtering for rides reuses
  `Maintenance::RideContextSql.predicate` as an `EXISTS` clause, the same join shape
  `Maintenance::CountedTowardQuery` already uses — and ride items carry their own
  `counted_toward`, computed via that same query, batched over the page's ride ids.
  `q` (ride name search) is ride-only by design — when set, every other source
  contributes zero rows (and zero `meta.kind_counts`), rather than searching fields
  that don't have a name to match.
- **The install/removal merge rule**: a `setup_removed` and a `setup_installed`
  entry merge into one `replaced` entry when they're the same slot (`bike_id` +
  `category` + `ride_context`) and the install's `started_at` is within
  `Activity::Feed::MERGE_TOLERANCE` (1 minute) of the removal's `ended_at` — **not**
  exact equality, despite that being the first, more obvious rule to reach for:
  `ComponentAssignment`'s own `no_overlapping_assignment_for_bike_slot` validation
  (`overlaps?`) treats an exactly-equal boundary as still overlapping, so a real
  swap can never actually be created with one — it always has a small real gap, and
  an exact-match rule would never fire on real data. The tolerance is the same
  small, clock-skew-sized allowance this codebase already uses elsewhere
  (`ServiceSession::FUTURE_TOLERANCE`, `StravaCredential`'s refresh buffer), not a
  new fuzzy-matching concept. Merging is a post-hydration, in-memory pass over one
  page's entries (bounded by `per_page`) — a replace pair that straddles an exact
  page boundary displays as two separate entries instead of one, an accepted,
  cosmetic limitation. Component retirement deliberately never appears here — it
  has no captured timestamp (`Component#retired_on` is a plain date field with no
  audit log of *when* it was toggled), so there's nothing to place chronologically
  without a real data-model addition.
- **`GET /activity`** (`ActivityController#index`), scoped through `current_user`
  throughout. Params: `kinds[]` (`ride`/`service`/`setup`, default `["ride"]`),
  `bike_id`, `from`/`to` (dates) + `tz` (reusing the Dashboard's own
  tz-then-UTC-boundary convention), `q`, `component_id`, `order` (`desc`/`asc`),
  `sort` (`date`/`distance`), `cursor` (opaque, keyset only — base64 of
  `occurred_at|kind_rank|source_id`), `page` (offset, distance-sort only),
  `per_page`. Response: `{ items, meta, next_cursor }` — `next_cursor` is `null` on
  the last page, an opaque cursor string for the date branch, or a page number
  (as a string) for the distance branch, so the frontend's `useInfiniteQuery` reads
  one field regardless of which branch served the page. `meta.ride_totals`
  (count/distance/moving_time/elevation) and `meta.kind_counts` are both computed
  from the non-`kinds` filters alone, independent of the active `kinds[]`
  selection — so the header stat and the chip counts stay meaningful regardless of
  which chips are toggled (`kind_counts` counts pre-merge rows, so an
  install+removal pair that displays as one "replaced" row still counts as two —
  merging is a display nuance, not a fact about how many events exist). Every
  non-ride item carries a server-built `summary` string (e.g. "Chain A · Wax",
  "Installed Wheelset B on Gravel bike, replacing Wheelset A") — the frontend only
  ever renders it, never assembles or parses the sentence itself; where a row needs
  a clickable component name (see below), that's a separate small link affordance
  next to the summary, not a hyperlinked substring within it.
- **Indexes**: `strava_activities(user_id, moved_at, id)` is the one index added on
  real justification — this feed is the first caller needing that table ordered by
  user across every bike at once (every existing index on it is `bike_id`-scoped).
  `service_sessions(user_id, performed_at, id)`, a partial
  `maintenance_events(performed_at, id) WHERE service_session_id IS NULL`, and
  `component_assignments(bike_id, started_at)` / `(bike_id, ended_at) WHERE ended_at
  IS NOT NULL` were added too, but `EXPLAIN (ANALYZE, BUFFERS)` against this
  account's real data showed Postgres preferring sequential scans over all of them
  at current scale (true for a personal, near-single-tenant app) — added as cheap,
  defensively reasonable indexes for the filtered-`WHERE` case, not because the
  evidence demanded them. **Flagged for the project plan doc** per this file's own
  convention, since five new indexes are a data-model change.
- **Frontend**: `pages/Activity.tsx` (`/activity`, nav item "Activity"), gated on
  `activity_log`'s `TableViewPreference` resolving first, same two-component
  wrapper/Inner split as every other adopter. Kind chips (Rides/Service/Setup
  changes, at least one always selected) persist in that *same*
  `TableViewPreference` row as this table's own column/sort prefs, via
  `useTableViewPreferences`' new `extraData` option (see "Sortable, configurable
  tables" above) — not a second preference row. Bike/component/date-range/name-
  search filters and the order/sort-metric controls are local, unpersisted state,
  same convention as the Rides tab's own filters; the date/distance sort control
  only renders when `kinds` is exactly `["ride"]` (mirroring the backend's `422`
  rule), else a dimmed hint takes its place. The table's configurable columns
  (`ACTIVITY_LOG_COLUMNS` in `constants.ts`) spread in
  `SHARED_RIDE_COLUMN_RENDERERS` wholesale plus this page's own `bike` column (the
  one ride column no other adopter needs, since every other one is already scoped
  to a bike or shows it as its own pinned column). Pinned: a 28px icon-only gutter
  (every row, including rides, via `@tabler/icons-react` — the app's first icon
  library dependency, since every icon elsewhere here is a plain Unicode glyph),
  then Date, then Name. A ride row renders normally through every visible column; a
  non-ride row renders the gutter icon and Date, then one `<Table.Td
  colSpan={1 + orderedColumns.length}>` absorbing the Name slot and every
  configurable column into a single summary cell on a
  `var(--mantine-color-gray-light)` surface — the `+1` for Name is why the span
  tracks column visibility automatically rather than needing its own state. A
  `service_session` row has a chevron expanding into indented sub-rows (component +
  service type + note) and opens `ServiceSessionViewModal` on click;
  `maintenance_event` links to `/components/:id?event=<id>`
  (`ComponentServiceAndHistory` now reads that param and scrolls to/highlights the
  matching history row, the same `?gear=<id>` convention `Strava.tsx` already used
  for "Resolve gear"); `setup_change` links to the installed component, with a
  second small link to the replaced one when the row is a merged entry. Ride row
  actions: "Log service after this ride" (only when the ride has a bike — opens
  `BatchServiceModal` with that bike and `moved_at + elapsed_time` as
  `initialPerformedAt`, the prop that feature left unused for exactly this caller),
  "View on Strava", and `ResyncRideButton` reused as-is. Deliberately no "change
  bike" action — a tooltip on the Actions header explains why (fix it on Strava,
  then Re-sync). Below 768px width the table swaps for a card list
  (`NarrowActivityCard`) — ride cards keep date/name/bike/distance/moving time and
  the same row actions; non-ride cards stay single lines, already compact enough.
  Invalidation: `['activity']` is in the `history` invalidation group (see "Cache
  invalidation" under Conventions), used by every mutation whose data this feed reads —
  ride/gear decisions and reassignment, a bike's `strava_gear_id` edits, every
  maintenance event and service session mutation, and component assignment
  create/update/delete.

**Not built**: week/month/year grouping headers with subtotals (shared with Ride
history); a weekly distance chart stacked by bike; a ride detail drawer; threshold
markers on the ride that pushed an interval into warning/due; a "since last
service" component-filter option; CSV export — all explicitly deferred.

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
   same way. The Bike detail page's Ride history table shipped here too — see
   "Ride history" above. A user-triggered full Strava refresh (with
   reconciliation), ride-level ignore, the Strava page's Gear/Rides tabs, and
   single/bulk ride resync (with rate-limit awareness and a gear-cache
   backfill) shipped here too — see "Strava integration" above. Batch service
   logging (`ServiceSession`, `Bikes::ServiceableComponents`'s point-in-time
   eligibility, the `BatchServiceModal` logger) shipped here too — see
   "Batch service logging" above. The Activity log (`Activity::Feed`, the
   `/activity` page) shipped here too — see "Activity log" above. Deploy,
   webhooks, and charts remain.

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
- **Cache invalidation**: every mutation's `onSuccess` calls
  `invalidate(queryClient, ...groups)` from `frontend/src/api/invalidation.ts` —
  never hand-listed `invalidateQueries` calls (the one exception is a
  single-key cache like `['me']` or `['table_view_preferences', key]`). Groups are
  coarse on purpose (`serviceStatus`, `history`, `setup`, `gear`, `rides`,
  `intervals`, …); pick every group whose server response the write can change, and
  when in doubt include it — over-invalidating only refetches mounted queries. A new
  query key must be added to a group in the same change.
