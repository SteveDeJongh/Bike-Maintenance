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

- Ruby on Rails, Postgres
- Hotwire (Turbo + Stimulus) for the UI — no separate frontend/SPA for the MVP
- Hosting TBD (Render or Fly.io are the leading candidates) — not needed until Phase 2

## Data model

- `Bike`: name, make, model, strava_gear_id, retired_on
- `Component`: label (e.g. "Chain A"), category (chain, cassette, tire_front, tire_rear,
  ...), acquired_on, retired_on — category doubles as a "slot" for validation
- `ComponentAssignment`: component_id, bike_id, started_on, ended_on (nullable = currently
  mounted) — records what was on which bike, when. No overlapping assignments for the
  same component, and no overlapping assignments for the same (bike, category) slot.
- `MaintenanceEvent`: component_id, event_type (wax, clean, replace, inspect),
  performed_on, notes
- `StravaActivity`: strava_id (unique), bike_id (resolved from Strava's gear_id),
  distance_meters, moved_on, name, activity_type, synced_at
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
2. Core CRUD — Bike, Component, ComponentAssignment, MaintenanceEvent models + Hotwire
   views. Fully testable with manually-entered data, no Strava yet. **<- current phase**
3. Strava OAuth + scheduled activity sync + gear-to-bike mapping screen.
4. Attribution dashboard — per-bike/per-component total distance, distance since last
   maintenance event, simple threshold alerts.
5. Polish — deploy, webhooks, charts, notifications.

## Conventions

- Write model specs (RSpec) alongside every model.
- Commit after each working increment.
- If a change here affects the data model or architecture, flag it back to the project
  plan doc rather than only updating this file.
