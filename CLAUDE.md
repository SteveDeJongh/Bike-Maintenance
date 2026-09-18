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
- Separate frontend SPA built with Vite, running on `localhost:5173` in development.
  The Rails app talks to it only via CORS (see `api/config/initializers/cors.rb`) —
  no server-rendered views, no Hotwire/Turbo/Stimulus/importmap. This replaced the
  original Hotwire-based UI plan. The frontend isn't scaffolded yet; when it is,
  it'll live in its own sibling directory alongside `api/`.
- Hosting TBD (Render or Fly.io are the leading candidates) — not needed until Phase 2

## Repo layout

This is a monorepo. The Rails app is rooted at `api/`, not the repo root — run
`bundle`, `rails`, `rspec`, etc. from inside `api/`. This file (CLAUDE.md) stays at
the repo root since it covers the whole project, not just the API. The Dockerfile
in `api/` expects to be built with `api/` as the build context (e.g. `cd api &&
docker build .`), not the repo root.

## Data model

- `Bike`: name, make, model, strava_gear_id, retired_on
- `Component`: label (e.g. "Chain A"), category (chain, cassette, tire_front, tire_rear,
  ...), acquired_on, retired_on — category doubles as a "slot" for validation
- `ComponentAssignment`: component_id, bike_id, started_on, ended_on (nullable = currently
  mounted) — records what was on which bike, when. No overlapping assignments for the
  same component, and no overlapping assignments for the same (bike, category) slot.
- `MaintenanceEvent`: component_id, event_type (wax, clean, replace, inspect),
  performed_on, notes
- `StravaActivity`: strava_id (unique), bike_id (resolved from Strava's gear_id,
  nullable until mapped), distance_meters, moved_on, name, activity_type, synced_at.
  The model/migration exist already (added early, alongside `Component#total_distance`
  and `#distance_since`/`#distance_since_wax`, so the API could expose those computed
  fields) — but nothing populates this table yet. That's still Phase 3 below.
- `StravaCredential`: access_token, refresh_token, expires_at, athlete_id, scope
  (single row — single-user app)

## Core logic

Strava gear tracking is per-bike, not per-component, so mileage attribution is computed
(not stored), via a service object or model method:

- `Component#total_distance` = sum of StravaActivity.distance where bike_id matches one
  of the component's assignments and moved_on falls within that assignment's
  [started_on, ended_on || today] window, summed across all the component's assignments.
- `Component#distance_since(event_type:)` = same sum, filtered to activities after the
  most recent MaintenanceEvent of that type.

## Strava integration

- OAuth scope: activity:read_all. Store the refresh token; refresh the access token as
  needed (6-hour expiry).
- Sync via a scheduled job polling GET /athlete/activities since last sync — no webhook
  needed until the app is deployed with a public URL (webhooks are a later upgrade).
- One-time setup screen to map each Strava gear_id to a local Bike record.

## Build order (work one phase at a time; don't jump ahead)

1. Skeleton — done once this file exists and `rails db:create` works.
2. Core CRUD — Bike, Component, ComponentAssignment, MaintenanceEvent models +
   JSON REST controllers (index/show/create/update/destroy), consumed by the
   separate Vite frontend. Fully testable with manually-entered data, no Strava
   sync yet. `Component#show` already returns `total_distance` and
   `distance_since_wax`, computed against the (currently empty) StravaActivity
   table. **<- current phase**
3. Strava OAuth + scheduled activity sync + gear-to-bike mapping screen. The
   StravaActivity model/migration already exist (see Data model above); this
   phase is about actually populating the table via OAuth + polling.
4. Attribution dashboard (frontend) — surface total distance, distance since
   last maintenance event, and simple threshold alerts using the API from
   Phase 2/3.
5. Polish — deploy, webhooks, charts, notifications.

## Conventions

- Write model specs (RSpec) alongside every model.
- Commit after each working increment.
- If a change here affects the data model or architecture, flag it back to the project
  plan doc rather than only updating this file.
