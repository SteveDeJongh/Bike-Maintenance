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

- `User`: name, email (unique) — no auth fields yet (no password/session). The app is
  single-user in practice, but every owned record is scoped to a `User` so real login
  can slot in later without another retrofit migration. `ApplicationController#current_user`
  is an explicit placeholder (`User.first!`) standing in for real login.
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
- `Bike`: user_id, name, make, model, strava_gear_id, retired_on
- `Component`: user_id, label (e.g. "Chain A"), category (chain, cassette, tire_front,
  tire_rear, ...), acquired_on, retired_on — category doubles as a "slot" for validation
- `ComponentAssignment`: component_id, bike_id, started_at, ended_at (nullable = currently
  mounted), ride_context (string: `"both"`/`"outdoor_only"`/`"indoor_only"`, default
  `"both"`, backend-validated — unlike `category`, this one directly drives computation,
  so it's a real enum, not a free-text frontend-owned concept). No overlapping
  assignments for the same component, and no overlapping assignments for the same
  (bike, category) slot — *except* an `outdoor_only` + `indoor_only` pair, and even then
  only when that category's `ComponentCategorySetting#allows_multiple_assignments` is
  `true` (e.g. a dedicated trainer cassette installed alongside a dedicated road
  cassette on the same bike at the same time) — a category with no such setting (or an
  explicit `false`) stays single-install-only even for a mutually-exclusive-context
  pair. Timestamps, not dates: a component can be swapped more than once in a day.
  Validates that `component.user_id == bike.user_id` (no cross-user assignments).
  Reachable from a `User` via `has_many through:` on `bikes` — no direct `user_id`
  column of its own.
- `ComponentCategorySetting`: user_id, category, default_ride_context (string, same
  3-value enum/validation as `ComponentAssignment#ride_context`, DB default `"both"`),
  trackable (boolean, DB default `true`), allows_multiple_assignments (boolean, DB
  default `false`) — unique per `(user_id, category)`. User-serviceable (`GET/PATCH
  /component_category_settings/:category`, upsert-by-key like `TableViewPreference`),
  surfaced on the Settings page's "Component Categories" section:
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
    what `ComponentAssignment`'s overlap validation reads to decide whether a
    mutually-exclusive-context pair is permitted for that category at all (see above).
  A missing row behaves as each column's own DB default (`"both"`/`true`/`false`).
  Seeded with a one-time, fully editable starting point (cassette/tire_front/
  tire_rear/wheel_front/wheel_rear/brake_pads_front/brake_pads_rear →
  `default_ride_context: "outdoor_only"`; chain/chainring/bottom_bracket/
  handlebar_tape/saddle → `"both"`; only `cassette` seeded
  `allows_multiple_assignments: true`) — deliberately *not* hardcoded logic; every row
  is changeable via the Settings page. A "frame" category and fully user-definable
  categories were raised during design but are an explicitly deferred future idea, not
  built — categories stay free-text exactly as they are today.
- `MaintenanceEvent`: component_id, event_type (wax, clean, replace, inspect),
  performed_at (timestamp), notes. Reachable from a `User` via `has_many through:` on
  `components` — no direct `user_id` column of its own.
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
  expires_at, athlete_id, scope
- `StravaGear`: user_id, strava_gear_id, name, brand_name, model (DB column — the
  obvious `model_name` collides with `ActiveModel::Naming#model_name`, which every
  ActiveRecord model inherits; the API's JSON still calls it `model_name` for clarity),
  retired, distance_meters, synced_at — unique per (user_id, strava_gear_id). A cache
  populated by `Strava::GearSync`, not derived from activity history alone.

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
- `Component#distance_since(event_type:)` = same sum, filtered to activities after the
  most recent MaintenanceEvent of that type.

Both of the above loop over the component's assignments in Ruby, issuing one
date-bounded query per assignment — unlike `Bike`'s stats, which batch into a single
grouped query per stat in `BikesController#index`. This is fine today because every
current caller (`ComponentDetail`, and a bike's own small "Installed components"
table) only ever renders a handful of components at once. Future idea, not built yet:
if this mileage ever needs to show on a table listing *many* components at once
(e.g. a column on the standalone Components list), these would need the same
batched treatment — a `component_assignments` ⨝ `strava_activities` join on
`bike_id` plus a `moved_at` range condition, `GROUP BY component_id` — replacing the
per-assignment loop.

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
  credentials:edit`) — required before `/strava/authorize` will work. `redirect_uri` is
  built from the current request's host (the `strava_callback_url` route helper), not a
  fixed config value.
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
  "unlink"/reassign on the Mapped gear section to be correct, not just additive.
- Bike-level stats (`Bike#total_distance`/`#total_moving_time`/`#first_ride_on`/
  `#last_ride_on`/`#total_elevation_gain`/`#installed_components_count`, shown on the
  Bikes list and detail page) sum/min/count directly over `strava_activities`/
  `component_assignments` — computed, not stored. `Bike#average_power` is the same,
  but restricted to `device_watts: true` activities (real power meter, not Strava's
  estimate) and **nil** (not 0) when the bike has none, so the UI can show "N/A"
  instead of a misleading "0 W". `BikesController#index` computes all of these via
  grouped queries (one per stat) to avoid per-bike N+1 on the list.
  Future idea, not built yet: a "needs maintenance" column (e.g. a chain overdue for
  wax) — there's no due-date/threshold concept anywhere yet (just `MaintenanceEvent`
  history), so this needs real design work before it can be built.

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

## Build order (work one phase at a time; don't jump ahead)

1. Skeleton — done once this file exists and `rails db:create` works.
2. Core CRUD — Bike, Component, ComponentAssignment, MaintenanceEvent models +
   JSON REST controllers (index/show/create/update/destroy), consumed by the
   separate Vite frontend. Done. `Component#show` returns `total_distance` and
   `distance_since_wax`.
3. Strava OAuth + activity sync + gear-to-bike mapping. Done, with one
   intentional deferral: sync is manually triggered for now (`bin/rails
   strava:sync_all` is ready for a future scheduler once the app is deployed).
   Also delivered here, ahead of schedule: a `User` model and `user_id` ownership
   on `Bike`/`Component`/`StravaActivity`/`StravaCredential`, so the app is
   shaped for real multi-user login later without another retrofit migration —
   `current_user` is still a placeholder (`User.first!`), not real auth.
4. Attribution dashboard (frontend) — surface total distance, distance since
   last maintenance event, and simple threshold alerts using the API from
   Phase 2/3. **<- current phase**
5. Polish — deploy, webhooks, charts, notifications.

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
