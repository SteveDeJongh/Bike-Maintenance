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
  `react-router-dom` for routing, `@tanstack/react-query` for data fetching, and
  Mantine (`@mantine/core`) for UI components.
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
- `Bike`: user_id, name, make, model, strava_gear_id, retired_on
- `Component`: user_id, label (e.g. "Chain A"), category (chain, cassette, tire_front,
  tire_rear, ...), acquired_on, retired_on — category doubles as a "slot" for validation
- `ComponentAssignment`: component_id, bike_id, started_at, ended_at (nullable = currently
  mounted) — records what was on which bike, when. No overlapping assignments for the
  same component, and no overlapping assignments for the same (bike, category) slot.
  Timestamps, not dates: a component can be swapped more than once in a day. Validates
  that `component.user_id == bike.user_id` (no cross-user assignments). Reachable from a
  `User` via `has_many through:` on `bikes` — no direct `user_id` column of its own.
- `MaintenanceEvent`: component_id, event_type (wax, clean, replace, inspect),
  performed_at (timestamp), notes. Reachable from a `User` via `has_many through:` on
  `components` — no direct `user_id` column of its own.
- `StravaActivity`: user_id, strava_id (unique), bike_id (resolved from gear_id,
  nullable until mapped), gear_id (Strava's raw per-activity identifier, stored
  separately from bike_id so a bike mapped *after* activities were already synced can
  retroactively backfill them — see `StravaActivity.reconcile_for_bike!`),
  distance_meters, moved_at (timestamp — the ride's start), name, activity_type (set
  from Strava's `sport_type`, not `type` — every stored row is already filtered to
  `type == "Ride"`, so `sport_type`'s finer granularity is the useful part), synced_at.
- `StravaCredential`: user_id (unique — one row per user), access_token, refresh_token,
  expires_at, athlete_id, scope

## Core logic

Strava gear tracking is per-bike, not per-component, so mileage attribution is computed
(not stored), via a service object or model method:

- `Component#total_distance` = sum of StravaActivity.distance where bike_id matches one
  of the component's assignments and moved_at falls within that assignment's
  half-open [started_at, ended_at) window — or [started_at, ∞) while still mounted —
  summed across all the component's assignments. The window is half-open so that an
  activity on a swap boundary is credited to exactly one assignment, never both.
- `Component#distance_since(event_type:)` = same sum, filtered to activities after the
  most recent MaintenanceEvent of that type.

## Strava integration

- OAuth scope: activity:read_all. `app/services/strava/client.rb` wraps the HTTP calls
  (token exchange/refresh, paginated activity fetch) via Faraday; `StravaCredential#ensure_fresh_access_token!`
  decides when to refresh (6-hour access token expiry) and persists Strava's rotated
  refresh_token. `client_id`/`client_secret` live in `config/credentials.yml.enc` under
  a `strava:` key (`bin/rails credentials:edit`) — required before `/strava/authorize`
  will work. `redirect_uri` is built from the current request's host (the
  `strava_callback_url` route helper), not a fixed config value.
- Sync is triggered manually for now (`POST /strava/sync` enqueues `StravaSyncJob`) via
  a "Sync now" button on the frontend's `/strava` page. `bin/rails strava:sync_all`
  exists for a future production scheduler (e.g. a Render Cron Job) to call once the app
  is actually deployed — not wired up to anything automatic yet, since there's no
  deployed host. No webhook until there's a public URL.
- `StravaSyncJob` pages `GET /athlete/activities` incrementally, using
  `StravaActivity.maximum(:moved_at)` as the `after` cursor (no separate "last synced"
  column). Only `type == "Ride"` activities are stored.
- Gear-to-bike mapping has no separate screen — it reuses the existing Bike edit form's
  "Strava gear ID" field (`PATCH /bikes/:id`), surfaced through the `/strava` page's
  list of currently-unmapped gear ids (`GET /strava/unmapped_gear`). Setting/changing a
  bike's `strava_gear_id` triggers `StravaActivity.reconcile_for_bike!` automatically
  (a `Bike` `after_update` callback), backfilling `bike_id` on any already-synced,
  previously-unmapped rows for that gear.

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
