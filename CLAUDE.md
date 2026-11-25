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

- **API**: Ruby on Rails, API-only (`config.api_only = true`), Postgres 14, RSpec. In `api/`.
- **Frontend**: Vite + React + TypeScript SPA in `frontend/`, on `localhost:5173` in dev.
  `react-router-dom`, `@tanstack/react-query`, Mantine (`@mantine/core`, `@mantine/dates`,
  `@mantine/notifications`),
  `@dnd-kit/*` (column reordering), `@tabler/icons-react`, Vitest.
- The two talk only via CORS (`api/config/initializers/cors.rb`) with a session cookie —
  no server-rendered views, no Hotwire/Turbo/Stimulus/importmap.
- Hosting not chosen yet (Render or Fly.io likely). See `docs/auth.md` for deploy constraints.

## Repo layout

Monorepo. The Rails app is rooted at `api/`, not the repo root — run `bundle`, `rails`,
`rspec`, etc. from inside `api/`. The frontend is `frontend/`. Reference docs live in
`docs/`. `api/Dockerfile` expects `api/` as the build context (`cd api && docker build .`).

- `api/app/services/` — every non-model, non-controller piece of logic, namespaced per
  area (`Strava::`, `Maintenance::`, `Bikes::`, `Activity::`, `Dashboard::`, `Auth::`, ...).
- `frontend/src/api/` — `queries.ts`, `mutations.ts`, `client.ts` (fetch + CSRF),
  `invalidation.ts` (cache groups).
- `frontend/src/pages/` — route pages; `frontend/src/components/` — shared and per-area
  components (`bike/`, `activity/`, `dashboard/`, `datatable/`, `forms/`, `ride/`).
- `frontend/src/constants.ts` — table column constants, category labels, status colors.

## Commands

```bash
# Postgres (Homebrew services is broken on this macOS version; start it directly).
# If start fails on a stale postmaster.pid, confirm no postgres is running (pgrep -x postgres)
# before removing the file.
pg_ctl -D /usr/local/var/postgresql@14 -l /usr/local/var/log/postgresql@14.log start

# API (from api/)
bin/rails server -p 3000          # health check: GET /up
bundle exec rspec                 # all specs; pass a path for one file
bin/rails db:migrate
bin/rails credentials:edit        # strava: client_id/secret, webhook_verify_token,
                                  #   webhook_subscription_id (after subscribing); google: (not yet)
bin/rails strava:sync_all         # incremental sync for every connected user
bin/rails strava:resync_all       # full resync for every connected user
bin/rails "strava:webhook:subscribe[https://<host>/strava/webhook]"  # also :show, :unsubscribe;
                                  #   one subscription per Strava app (docs/strava.md, "Webhooks")
bin/rails "users:claim[email]"    # one-time: give the pre-auth seed user a real login
bin/rails components:audit_retired_mounted  # read-only: retired components still on a bike

# Frontend (from frontend/)
npm run dev                       # Vite on :5173
npm run test                      # vitest run (once, not watch)
npm run lint
npm run build                     # tsc -b && vite build — the type check
```

Dev mail is caught by `letter_opener_web` at `http://localhost:3000/letter_opener`.
Background jobs (e.g. `StravaSyncJob`) run in-process with the default async adapter in dev.

## Domain at a glance

Full fields, validations, and rules: `docs/data-model.md`.

- `User` (+ `UserIdentity` per OAuth provider) owns everything. `Users::Provision` runs on
  `after_create` for every creation path and seeds the per-user defaults below.
- `Bike` (optional `BikeType` preset), `Component` (free-text `category` doubles as a slot),
  `BikeComponentSlot` (which categories a bike tracks), `ComponentAssignment` (component on
  bike over `[started_at, ended_at)`, with a `ride_context` of `both`/`outdoor_only`/`indoor_only`).
- `ComponentCategorySetting` — per-user, per-category defaults (default ride_context,
  trackable, `allows_multiple_assignments`, `rotates`, notification overrides, `common_brands`).
- Maintenance: `ServiceType` (user-defined, optionally tagged with categories via
  `ServiceTypeCategory` — untagged = universal), `MaintenanceEvent`, `ServiceSession` (a batch
  of events on one bike), `CategoryServiceRequirement` (template) →
  `ComponentServiceRequirement` (what applies to one component, linked or custom) →
  `ServiceRequirementSatisfier` (which service types clear it, and how far each buys).
- Alerts: `NotificationSetting`, `ServiceAlertDismissal`.
- Strava: `StravaCredential`, `StravaActivity` (synced rides), `StravaGear` (gear cache).
- `TableViewPreference` — per-user saved column/sort state for each configurable table.

Mileage, service status, and alerts are always **computed** from rides, assignments, and
event history — never stored as counters.

## Hard rules

Domain and backend:
- **Assignment windows are half-open** `[started_at, ended_at)` everywhere — attribution,
  `ComponentAssignment#overlaps?`, and the one-step swap all depend on it.
- **Indoor/outdoor has exactly one definition.** Indoor = `trainer: true` *or*
  `activity_type == "VirtualRide"` (Zwift doesn't reliably set `trainer`). In Ruby use
  `StravaActivity.indoor`/`.outdoor`/`#indoor?`; in SQL use
  `Maintenance::RideContextSql` / `Maintenance::RideFilterSql`. Never hand-roll it again.
  Batched SQL using these needs a parity spec against the Ruby scopes.
- **Service status goes through one path**: `ComponentServiceRequirement#effective` for
  inheritance, `Maintenance::RequirementStatus` / `BatchedPositionQuery` for computation.
  Callers never resolve template inheritance or the due-point math themselves.
- **Shared classifications are shared.** "Needs attention" vs "ignored" rides:
  `StravaActivity.needs_attention_for`/`.ignored_for`. Every raw Strava payload write goes
  through `Strava::ActivityUpsert` (it clears `ignored_at` on attribution). Serviceable
  components: `Bikes::ServiceableComponents`. Installed / spare / retired:
  `componentState` (`utils/componentState.ts`), never re-derived inline.
- **Check batching before adding a per-row column.** `Component#total_distance`/
  `#distance_since` run one query per assignment — fine for a handful of components, not
  for a list. Many-row tables need a grouped/batched query like `BikesController#index`
  or `Maintenance::BatchedPositionQuery`.
- **The API returns raw values** — meters, seconds, ISO dates — never pre-formatted
  sentences (the Activity log's server-built `summary` is the one deliberate exception).
  The UI always displays km via `formatDistance` (and `formatDuration`, `formatSpeed`, ...).
- **Service-type tags filter, they never forbid.** A picker with a category shows
  types tagged for it plus universal (untagged) ones first, with every other type
  behind "Show all types"; nothing rejects a type on an untagged category, and
  existing events/requirements/satisfiers stay valid whatever their tags. Every
  service-type choice goes through `ServiceTypePicker`, passing the category it
  knows. Automatic tagging: a type created inline from a picker with a category is
  tagged with it; adding or switching a satisfier tags its type with the
  requirement's category (`ServiceType#tag_for!` via the satisfier's `after_save`)
  — but only when the type is tagged and not for that category, since tagging a
  universal type would narrow it. Creating from Settings starts universal. Nothing
  ever removes a tag automatically.
- **Local-time boundaries come from Ruby's zone data**, passed to SQL as UTC
  instants (`width_bucket` for per-day grouping) — never `AT TIME ZONE <name>`, since
  Postgres's tz database can disagree with Ruby's (`docs/dashboard.md`, `stats`).
- Category is free text, validated on the frontend only. Categories can't be
  renamed; if a rename is ever added, it must update `component_category_settings`
  and `service_type_categories` in the same transaction. `ride_context` is a real
  backend-validated enum because it drives computation. Anything that drives computation
  gets a real model/enum, not free text.
- Every query is scoped through `current_user`; cross-user access 404s. Models that
  reference another user-owned record validate same-owner.
- `TableViewPreference` `PATCH` replaces the whole `data` value (no deep merge) — always
  send the complete object.

Auth and CORS:
- Cookie session + CSRF (`X-CSRF-Token` from `GET /auth/csrf`), not tokens. Every
  sign-in/sign-out path calls `reset_session` first.
- **CORS must keep `credentials: true` and a literal origin (never `"*"`).** Without it,
  the browser hides every response and `fetch()` fails like "not signed in", even though
  the server-side sign-in succeeded. Request specs can't catch this — only a real browser.
- Only link an OAuth identity to an existing user by a **provider-verified** email
  (`Auth::ResolveIdentity` is the one place that decides).

Frontend:
- **Strava sync completion is detected in one place**: `useSyncCompletionWatcher`,
  mounted once in `Layout.tsx`, polls `GET /strava/status` while `sync_in_progress`
  (`strava_credentials.sync_started_at`/`full_sync_started_at`, cleared in the job's
  `ensure`, self-healing after `RUNNING_TIMEOUT`) and invalidates `RIDE_DATA_GROUPS`
  when a sync timestamp changes. Page-scoped polling dies on navigation, so never
  add completion invalidation to `useStravaSyncRunner` or a page — and don't give a
  second `['strava', 'status']` observer its own `refetchInterval` (TanStack only
  dedupes in-flight fetches, so two timers mean two requests per tick). See
  `docs/dashboard.md`.
- **Never hardcode a color.** Use Mantine tokens/CSS variables, named colors, or `"radar"`
  (the primary accent). "ok" status is `teal`, never `green`, so it's never confused with the accent.
  The one exception is `--strava-orange` (`index.css`), Strava's brand colour, which their guidelines
  require for "View on Strava" links. Reference the variable, never the hex.
- **A ride opens `RideDetailModal`.** Ride lists carry no ride-level row actions; Log service,
  Re-sync, View on Strava and Link gear live in the modal (`docs/rides-and-activity.md`).
- **Swap choices go through `swapOptions`** (`utils/swapOptions.ts`, via `useSwapOptions`):
  the pill and Retire's "Replace with" both use it, and it mirrors exactly what the swap
  endpoint accepts (spares, plus shared indoor cassettes for `indoor_only` slots).
- **Scroll position is React Router's job**: `<ScrollRestoration />`, rendered once in
  `Layout.tsx` (AppShell scrolls the window). Never add `window.scrollTo`. A
  search-param update that shouldn't jump to the top passes `preventScrollReset: true`
  (Strava's tabs); an in-page highlight uses `scrollIntoView` in an effect.
- **New modals use `AppModal`**, never Mantine's `Modal` directly (it goes full-screen on mobile).
- **Shared building blocks** (`docs/frontend-ui.md`): a row of summary tiles goes in
  `TileRow`, never a hand-rolled flex or grid. A list whose rows open something is a
  `DataList` (`components/datalist/`: header, whole-row `DataListRow`, bands,
  `FieldsPicker`), not a new grid; size its field columns with `fieldMinWidth` so
  headers never overlap. A bike page section's heading is a `PageSection` (collapsible,
  remembered per device in localStorage, never per account).
- **Responsive:** prefer CSS (`hiddenFrom`/`visibleFrom`, per-breakpoint props) over JS.
  When JS branching is truly needed, use `useIsMobile()` — never a new media query. Its
  `767.98px` boundary must stay in sync with `index.css`'s iOS-input-zoom rule.
- **A configurable table renders both views** — the desktop `<Table>` and, on mobile,
  `MobileSortControl` + `DataCardList`. `Assignments.tsx` is the reference implementation.
  A pinned column always links somewhere. Non-configurable tables wrap in
  `Table.ScrollContainer` unless they genuinely fit at 390px.
- Gate rendering of any component calling `useTableViewPreferences` on its preference
  query having resolved (it seeds state once, on mount).
- Brand/model inputs are `Autocomplete` (free text), always through `ComponentBrandModelInputs`.
- Small tap targets on mobile get `MOBILE_TAP_TARGET_STYLE` (44px).

## Conventions

- Write model specs (RSpec) alongside every model.
- Commit after each working increment.
- Date/time column naming: `_at` for datetime columns, `_on` for date-only columns.
  Keep this consistent for any new column — if a column gains a time component, rename
  it to `_at` in the same migration. Current date-only columns: `bikes.acquired_on`,
  `bikes.retired_on`, `components.acquired_on`, `components.retired_on`.
- Logic that isn't a model or controller lives in `app/services/`, namespaced per
  integration (e.g. `Strava::Client`). Zeitwerk autoloads it with no config change.
- If a change here affects the data model or architecture, flag it back to the project
  plan doc rather than only updating this file — and update the matching `docs/` file.
- **Cache invalidation**: every mutation's `onSuccess` calls
  `invalidate(queryClient, ...groups)` from `frontend/src/api/invalidation.ts` —
  never hand-listed `invalidateQueries` calls (the one exception is a single-key cache
  like `['me']` or `['table_view_preferences', key]`). Groups are coarse on purpose
  (`serviceStatus`, `history`, `setup`, `gear`, `rides`, `intervals`, …); pick every group
  whose server response the write can change, and when in doubt include it —
  over-invalidating only refetches mounted queries. A new query key must be added to a
  group in the same change.
- **Frontend tests**: Vitest, configured in `vite.config.ts`'s `test` key (imported from
  `vitest/config`), `environment: 'node'` — no jsdom/React Testing Library until a test
  actually needs to mount a component. Test files sit beside what they test
  (`dateRanges.test.ts` next to `dateRanges.ts`) and import `describe`/`it`/`expect`/`vi`
  explicitly from `'vitest'` (no globals). **New pure helpers extracted from a page or
  component get a test alongside them.**
- API endpoints that upsert by key (`TableViewPreference`, `ComponentCategorySetting`,
  `NotificationSetting`) use `PATCH` on the key, creating the row if missing. A missing
  settings row behaves as its DB defaults.
- Batch endpoints that create several rows in one transaction reject the whole request
  with `422 { row_errors: { "<index>": {...} } }` (see `component_setup`, `service_sessions`).

## Current phase

Phase 5, Polish. Remaining work: deploy, charts. The Strava page's Rides tab
still has no mobile card view (see `docs/frontend-ui.md`). Once deployed and
subscribed, webhooks push ride creates, edits and deletes; gear changes still need a
sync, which stays manual until there's a deployed scheduler (`docs/strava.md`).

## Further docs

Read the relevant file before working in that area. Quoted cross-references inside
these docs (e.g. see "Strava integration") name the `##` headings listed here.

- `docs/data-model.md` — **Data model**, **Core logic**. Every model's columns,
  validations, uniqueness rules, and mileage attribution. Read before any migration or
  model change.
- `docs/service-requirements.md` — **Service intervals and maintenance alerts**, **Batch
  service logging**. The due-point algorithm, batched position query, alert eligibility
  and dismissals, the requirement/satisfier UI, `ServiceSession` and `BatchServiceModal`.
- `docs/strava.md` — **Strava integration**, **Webhooks**. OAuth, incremental and full sync,
  reconciliation, gear mapping/ignoring, ride ignore, single and bulk resync, sync
  failure recording, rate limits.
- `docs/auth.md` — **Authentication**. Sessions/CSRF/CORS, `Auth::ResolveIdentity`,
  Strava as a sign-in method, mail and tokens, deferred Google/Apple, deployment notes.
- `docs/frontend-ui.md` — **Sortable, configurable tables**, **Shared building blocks**,
  **Bikes page**, **Components page**, **Component page** (incl. the installation
  modal), **Bike page**, **Maintenance page** (incl. the Log service modal), **Theming**,
  **Layout and navigation**, **PWA**. How to adopt the table system, card view,
  breakpoints, nav config, `AppModal`, mobile date pickers, the manifest and icons.
- `docs/dashboard.md` — **Dashboard**. `Dashboard::Summary` (incl. `stats`), the
  header and tiles, `useStravaSyncRunner`, the `tz` param, `RideContextSql`.
- `docs/rides-and-activity.md` — **Ride history**, **Activity log**. The (now unread)
  bike rides endpoint and odometer, Activity's link-in URL params, the ride details modal (`RideDetailModal`, `GET /strava/rides/:id`),
  `Activity::Feed`'s keyset/offset branches, week totals and metric sorts, the install/removal
  merge rule, the `/activity` page.
- `docs/components-and-setup.md` — **One-step component swap**, **Installed, spare and
  retired**, **Last bike and the Components list's Bike column**, **Deleting a
  component**, **Retiring a component**, **Bike setup**,
  **Brand/model autocomplete**. Swap endpoint and modal, bike types and batched
  component setup, suggestion sources and ranking.
