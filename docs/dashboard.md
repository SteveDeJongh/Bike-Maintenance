# Dashboard

> Reference material split out of CLAUDE.md. A quoted cross-reference such as "see \"Strava integration\"" names a `##` section heading; CLAUDE.md's "Further docs" list says which docs/ file holds each heading.

## Dashboard

The app's landing page (`frontend/src/pages/Dashboard.tsx`, at `/`) answers "is my
data current?" and "what needs my attention?" at a glance . Backed by a single
`GET /dashboard` request, assembled by `Dashboard::Summary.call(user, tz:)`
(`app/services/dashboard/summary.rb`) entirely from existing primitives — no new
distance/status computation happens here that doesn't already live elsewhere:

- **`sync`** — `StravaCredential#last_synced_at`, a count/distance split of
  `StravaActivity.needs_attention_for(user)` into `with_gear` (fixable via gear
  mapping) vs `without_gear` (Strava itself had no bike set), and
  `unmapped_gear_count` from `StravaGear.unmapped_for(user)` (a model class method, also behind `StravaController#unmapped_gear`). `needs_attention_for`
  (see the `StravaActivity` data model bullet and "Strava integration" above) is the
  one shared definition of "unattributed and not ignored" — a ride whose gear is
  ignored (and hasn't resurfaced), or that's individually ignored, is excluded from
  `unattributed`/`with_gear` entirely by that scope, same as if it were attributed; a
  no-gear ride is explicitly spared from the gear-ignore exclusion, since a plain
  `NOT IN (...)` isn't NULL-safe on its own. `Strava::RideLog` (the Rides tab's
  endpoint) is the other caller of the same scope — this count and the Rides tab's
  own "Needs attention" count never disagree. Also carries `last_sync_failed_at`/
  `last_sync_error`/`last_sync_retry_at`, straight from the credential (no
  `last_sync_failed_kind` — the header shows one generic failure chip
  regardless of full vs incremental, leaving that detail to the Strava page's own
  status) — this is what lets the header's failure state survive a page reload
  instead of only ever reflecting `useStravaSyncRunner`'s in-memory, poll-only
  failure (see "Frontend" below).
- **`bikes`** — one entry per non-retired bike: `total_distance`/`ride_count`/
  `last_ride_on`/`distance_this_month` via the same grouped-query-per-stat pattern
  `BikesController#index` already uses (no per-bike N+1), plus `mounted`
  (currently-installed components, each with a `display_metric`:
  `{requirement_name, distance_meters, moving_time_seconds, days,
  since_service_type_name}`, meters/seconds/days only, same
  API-returns-meters/UI-converts convention as everywhere else — see
  `formatDistance`/`formatDuration`; `since_service_type_name` is specifically the
  **setting event's** own service type, not always the same string as
  `requirement_name` now that a requirement can have more than one satisfier, e.g.
  "Chain lube" cleared by a drip wax) and `off_bike` (non-retired components whose
  most recent assignment was on this bike but have no active one anywhere). Both
  draw their per-component status from
  `Maintenance::RequirementStatus.worst_result_by_component` (returns the full winning `Result`; `worst_status_by_component` is a one-line wrapper over it) and
  their bike-grouping from `Component.current_bikes_by_component` .
  Each `mounted`/`off_bike` entry also carries the card's wear fields, straight from
  that worst `Result` via `Maintenance::WearFields` (shared with the ride details
  endpoint; all `null` with no enabled requirement): `fraction_used`,
  `driving_dimension`, `distance_remaining_meters`, `moving_time_remaining_seconds`,
  `days_remaining`. "Worst" is worst status, then — new for the wear bar — highest
  `fraction_used` among requirements sharing that status, so the bar and the
  `display_metric` both show the *driving* requirement (status-only callers like the
  Components table can't change). **`total_distance_meters`** (lifetime, via
  `Component#total_distance`) is set only for components in a **rotation pair** — an
  off-bike component in a **rotating category** (`ComponentCategorySetting#rotates`,
  read once per request; chain by default) plus every mounted one of the same category
  on that bike — and `null` otherwise. Each `off_bike` entry carries `rotates`, so the
  card knows which ones get a strip; it runs one query per assignment per paired component, fine for
  the handful on a card and an open batching question if more of the page needs it.
  A component with no requirement already has its lifetime total in
  `display_metric.distance_meters`. **`last_ride_activity_type`** — the latest ride's
  Strava sport type, from one `DISTINCT ON (bike_id)` query for every bike.
- **One status computation per request.** `Summary#results` memoizes
  `Maintenance::RequirementStatus.for_user(user)`; `attention`, `upcoming` and the
  bikes' `worst_result_by_component(user, results:)` all derive from it (the
  dashboard used to compute every status twice).
- **`attention`** — every enabled, non-ok, non-retired requirement
  (`Maintenance::RequirementStatus.for_user`), deliberately broader than the alert
  banners' `Result#banner_eligible?`: a dismissed or notifications-off item, or one
  on a currently-unmounted component, still appears here, just flagged
  (`dismissed`/`notifications_off`/`mounted`) rather than hidden. Ordered
  due-before-warning, then by `Result#fraction_used` (cheap arithmetic over
  numbers the status computation already has) descending. Each item carries the
  requirement's resolved `satisfiers` (needed so the frontend's "Log service"
  button on this item can default to the position-1 satisfier, same convention as
  `ComponentDetail`'s own split button — the item has no single `service_type_id`
  of its own to pre-fill with otherwise) and `setting_event`. Other code and specs
  rely on these semantics; a spec pins its exact key set.
- **`upcoming`** — the same item shape for the nearest **ok** requirements on
  non-retired, **currently mounted** components (checked against the
  `current_bikes_by_component` hash already loaded, not per-result `mounted?`
  queries), ordered by `fraction_used` descending, capped at `UPCOMING_LIMIT` (5).
  Up next shows these after the attention items.
- **`recent_rides`** — a plain array of the user's `RECENT_LIMIT` (5) newest
  activities, newest first, whatever their age (no date window, no summary; ignored
  rides included, as before). Each: `id`, `moved_at`, `name`, `activity_type`
  (Strava's `sport_type`), `distance_meters`, `moving_time`, `elapsed_time` (seconds,
  null when Strava omitted it, so "Log service after this ride" can prefill the
  session at the ride's end), `bike`, `gear_id`, `indoor` (`StravaActivity#indoor?`).
  `gear_id` rides alongside a `null` bike specifically so the frontend can offer
  "Link gear" only for the fixable-via-gear-mapping case, same distinction as
  `sync.unattributed.with_gear`. **No `counted_toward` any more** — the old 14-day
  table showed which components each ride counted toward; the Home panel doesn't,
  and nothing else on the page read it. `Maintenance::CountedTowardQuery` itself
  stays (`Activity::Feed`, `BikesController#rides`, `StravaController#rides` use it),
  now taking `activity_ids:` only — its `since:` option existed only for this
  section and `bike:` had no caller, so both went; its split indoor/outdoor parity
  spec now goes through `activity_ids:`.
- **`recent_service`** — the 5 newest service entries, built from `Activity::Feed`
  (`kinds: %w[service setup]`, `include_meta: false` — a Feed option added for this,
  default `true`, that skips the ride-totals and per-kind count queries), in the
  feed's **own entry shape** with its server-built `summary` (the activity log's
  wording: "Service · 2 items on Soloist" for a session — one entry however many
  components it serviced — "Chain A · Wax" for a session-less event, "Installed
  Chain A on Soloist, replacing Chain B" for a swap). Kept: `service_session`,
  `maintenance_event`, and `setup_change` entries whose `action` is `replaced` (the
  feed's merged removal+install pair — swaps are already feed entries). Plain
  installs/removals are setup, not service, and are filtered out after the fetch,
  since the feed merges pairs in memory and has no swaps-only kind; it fetches
  `FEED_HEADROOM` (50) rows to filter from, so more than 45 plain installs/removals
  newer than the fifth service entry would show fewer than five rows — accepted.
- **`stats`** — riding totals for the summary tiles, all in the viewer's `tz`:
  `today` (local date), `week` (the Monday-start week containing today: `start_date`,
  `distance_meters`, `moving_time_seconds`, `elevation_gain_meters`, `ride_count`, and
  `daily` — always seven `{date, distance_meters}`, Mon–Sun, zero-filled), `month`
  (same totals for the calendar month) and `year_to_date` (`distance_meters` for
  Jan 1 → now, `last_year_to_date_distance_meters` for Jan 1 → the same local date
  and time last year, and `last_year_total_distance_meters`). "Same moment last
  year" is ActiveSupport's `now - 1.year`, which clamps a Feb 29 today to Feb 28.
  **Which rides count:** every synced ride (`user.strava_activities.not_ignored`) —
  including rides with no bike, rides on ignored ("don't track") gear, and indoor
  rides — since these are riding totals, not wear; only rides individually ignored
  via `ignored_at` are excluded. The sync only stores `Ride`/`VirtualRide`
  (`StravaSyncJob::SYNCED_TYPES`), so no runs or other sports leak in.
  **Two queries, whatever the windows:** one row of `SUM(...) FILTER (WHERE moved_at
  >= ? AND moved_at < ?)` aggregates for every window (each column aliased — unaliased
  they'd all be `coalesce`, and ActiveRecord would cast every one with the first
  column's bigint type, truncating the float elevation sums), and one `GROUP BY
  width_bucket(moved_at, ARRAY[<eight local midnights>])` for `daily`. Every boundary
  is computed in Ruby in the zone (DST-aware) and passed as UTC. The days are
  deliberately **not** grouped with `moved_at AT TIME ZONE <name>`: Postgres ships its
  own tz database, which can disagree with Ruby's (on the dev machine, Postgres 14
  still has America/Vancouver at UTC-8 while the system zoneinfo Ruby reads has BC's
  permanent UTC-7), and the days must line up exactly with the week boundary. With
  `width_bucket` the raw `tz` param never reaches SQL at all. `bikes[].
  distance_this_month` is computed separately and unchanged.

**`Maintenance::RideContextSql.predicate(assignment_alias:, activity_alias:)`**
(`app/services/maintenance/ride_context_sql.rb`) is the one shared SQL fragment
behind every batched ride_context filter — callers include `Maintenance::BatchedPositionQuery` (composed with `Maintenance::RideFilterSql` for a requirement's own `ride_filter`) and `CountedTowardQuery` above. It has to stay bit-for-bit equivalent to
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
converts to UTC for the actual query range. `stats` (above) is its second user:
every week/month/year boundary there is computed the same way. Nothing is persisted — if more of the
app ever needs a real per-user timezone, that's a `User#time_zone` column, a
genuine data-model change deliberately not made speculatively here.

**Frontend**: `Dashboard.tsx` owns the one `useDashboard(tz)` query plus a
`useStravaSyncRunner({ full: false })` for its "Sync now" button — see
`useStravaSyncRunner` below for what that hook actually does (polling goes through `GET /strava/status`, shared with the Strava page). `components/dashboard/`:

- **`DashboardHeader`** (it replaced the full-width `SyncStrip` and carries
  everything it did) is the single place Strava-related issues surface on the
  dashboard. Left: the title "Home" and a dimmed date line, "Friday, Nov 20 · week
  47" (`formatHeaderDate`/`isoWeekNumber` in `utils/datetime.ts` — ISO weeks). Right,
  in a group that wraps on narrow screens:
  - a **status pill** (a rounded `Paper`), highest priority first: a sync in
    progress (`syncing` or `stillRunning`) → gray "Syncing…" (so "still running"
    needs no chip of its own); else a failure (`resolveFailure`, below) → red "Sync
    failed"; else a primary-colour check and "Strava synced {relative time}". Its
    tooltip shows the absolute last-synced time and the ride total. The old strip's
    orange "Needs attention" badge state is gone — the chips carry it.
  - **issue chips**, only when they apply, in this order, each a link where there's
    an action: sync failure (red, `syncFailureMessage` text; a link to
    "Reconnect Strava" for `auth_failed` only), unmapped gear (orange, "N unmapped
    gear · Link gear" → `/strava?tab=gear`; shown when `unmapped_gear_count` or
    `with_gear.count` is non-zero, falling back to counting the rides when the gear
    count is 0), and rides with no bike on Strava (orange, "N rides with no bike ·
    Review" → `/strava?tab=rides`, `without_gear.count`).
  - **Sync now**, from the page's `useStravaSyncRunner({ full: false })`.
  - Not connected: all of the above is replaced by a single "Connect Strava" button.

  The detailed "map it, track it as retired, or don't track it" guidance lives
  where the user actually acts on it: a one-line hint above the Gear tab's Unmapped
  gear table, and one appended to the Rides tab's own hint text on its "Needs
  attention" view (see "Strava integration") — the header only surfaces that
  something needs attention and links to where to fix it.
  **`resolveFailure(sync, liveFailure)`** (`utils/syncFailure.ts`) prefers
  `useStravaSyncRunner`'s own in-memory `failure` (richer: it's from the exact run
  this page triggered), but falls back to the credential's own
  `last_sync_failed_at`/`last_sync_error`/`last_sync_retry_at` (`sync` section
  above) whenever `last_sync_failed_at` is present and not already older than
  `last_synced_at` — this is what lets the failure survive a page reload. No
  separate "clear" step: once a later sync succeeds, `last_synced_at` moves past
  `last_sync_failed_at` and the function starts returning `null` again on its own.
- **`SummaryTiles`** — four `StatTile`s (uppercase dimmed label, large value, dimmed
  secondary line) in a `repeat(auto-fit, minmax(260px, 1fr))` grid, all from
  `stats` plus `attention`:
  - **This week**: distance; moving time · elevation gain; `WeekBars`, seven plain
    divs (no chart library) scaled to the week's biggest day. Days after
    `stats.today` (the server's local date, so they can't disagree with its day
    grouping) are a flat neutral stub; a past day with no riding is a flat
    primary-light stub.
  - **{Month name}**: distance; moving time · elevation gain · ride count.
  - **Year to date**: distance and `formatPercentChange` vs last year to date
    (`utils/stats.ts`; primary colour when up, dimmed when down, hidden when last
    year had nothing); `YearProgressBar`, this year against last year's full total
    with a tick at last year's same-date total (hidden with no last-year total);
    "Last year by today: N km".
  - **Next service** (`NextServiceTile`): `attention[0]`, so the same
    due-before-warning order as Up next. The value is
    `formatDrivingRemaining(item)` (`utils/serviceInterval.ts`) — only the driving
    dimension, "8 km left" / "120 km over" / "1.5 hrs left" / "3 days left", never a
    pace-based estimate — coloured by `SERVICE_STATUS_COLORS`, which also colours the
    tile's border. Then "{component label} · {requirement name}" (a link to the
    component), and "Log service", which opens `MaintenanceEventFormModal` with the
    same prefill as `UpNextRow` (`primarySatisfier`, shared by both), so the save
    and its invalidation are identical. No attention items: a check and "All caught
    up".
- **`UpNext`/`UpNextRow`** (replaced Needs attention) — a self-contained `Paper`
  with no width assumptions, so it works full width now or as a ~340px column
  later. Header "Up next" with "N due" (red) / "N soon" (yellow, the app's warning
  colour) badges counted from `attention`. Rows: `upNextItems(attention, upcoming)`
  (`utils/upNext.ts`) — every attention item (never cut off), then ok rows until
  five in total. Each row: the component label (a link) · requirement name; on the
  right, coloured by status, `formatDrivingRemaining` (driving dimension only, no
  time estimates — projecting dates from recent riding was considered and rejected,
  since it misleads when habits or bike choice change); a thin `Progress` on
  `min(fraction_used, 1)` in `SERVICE_STATUS_COLORS` (teal for ok); a dimmed line
  with the bike name or "Not mounted" and `formatUsedOfTotal` ("192 / 200 km", where
  the total is used + remaining — the real due span, which a satisfier's own
  allowance can make differ from the nominal interval); grey "Dismissed until next
  sync" / "Notifications off" badges on alerting rows only; and "Log service" —
  `MaintenanceEventFormModal` as-is, pre-filled with the item's **position-1
  satisfier** (`primarySatisfier(item.satisfiers)`, `utils/serviceInterval.ts`, same
  default-satisfier convention as `ComponentDetail`'s own split button). Footer "All
  service intervals →" links to `/components` (there's no all-intervals page yet).
  With neither list populated: "No service intervals set up yet" linking to
  Settings → Component categories (a user whose only requirements are on unmounted
  ok components also lands here — no count field distinguishes them).
- **`BikeCard`** — header: the name (link) and "Last ride Nov 16 · Gravel Ride"
  (`formatSportType`, `utils/strava.ts`), with a chip from the mounted components'
  `service_status`es (`bikeStatusCounts`): "N due" / "N soon", or teal "All OK".
  Total / This month / Rides between dividers. **Component wear**: one grid (label |
  bar | metric, rows as `display: contents` so every bar lines up), sorted by
  `fraction_used` descending (`sortByWear`; no-requirement components last). The bar
  is `min(fraction_used, 1)` in the status colour; the metric is
  `wearMetricLabel` — `formatDrivingRemaining`, red when due, with " · {requirement
  name}" appended unless the name already contains the category label (so a
  chain's "Wax" reads "8 km left · wax" but "Chain replacement" adds nothing); with
  no requirement, an empty track and "{lifetime} total". Tapping a row opens
  `AssignmentDetailModal` for that row's `assignment_id`, the same installation modal
  the bike page's rows open, with its own swap pill (`docs/components-and-setup.md`).
  It fetches the bike's `GET /bikes/:id` on open, and a swap there refreshes
  `/dashboard` through `serviceStatus`. **Rotation strip** (`rotationGroups`, `utils/bikeCard.ts`):
  for each category with `rotates: true` where the bike has both an off-bike component
  (the existing `off_bike` rule) and a mounted one — chains by default, any category
  the user sets to rotate on Settings → Component Categories — "{Category} rotation" with "Off: {label} · {display metric}", a
  split bar of each side's `total_distance_meters` (mounted in the primary colour,
  off-bike in `--mantine-primary-color-9`), and per-component labels. An off-bike
  component in a non-rotating category, or with no mounted partner, keeps the plain
  "Off the bike: …" line — so a replaced tire left un-retired no longer reads as a
  rotation. Footer:
  an outline "Log service" (`BatchServiceModal`), pinned to the bottom.
- **`BikeCards`** — "Bikes" with "N bikes · sorted by most urgent" and "Manage
  bikes →". `sortBikesByUrgency`: most due components, then most warning, then most
  recent ride (never-ridden last), then name — frontend-only, no API order. Desktop:
  a flex track with `overflow-x: auto` and `scroll-snap-type: x mandatory`, cards
  `flex: 0 0 420px` with `scroll-snap-align: start` (a single bike stays 420px),
  sharing one height (stretch). `useHorizontalOverflow(ref, resetKey)`
  (`hooks/`) tracks overflow and position with a `ResizeObserver` plus a scroll
  listener: round arrow buttons ("Scroll bikes left/right") scroll one card plus
  the gap, smoothly, disable at their end and hide when nothing overflows; a
  right-edge gradient to `--mantine-color-body` (`pointer-events: none`) shows
  while there's more to the right. Phone (`useIsMobile`): cards stacked full-width,
  no arrows or fade.
- **`RecentRides`** and **`RecentService`** — two panels side by side at the
  bottom (`flex: 3 1 520px` and `2 1 340px` in a wrapping `Flex`, so they stack on
  narrow screens); they replaced the full-width 14-day `RecentRidesTable`, and with
  it the old "plain table, deliberately not the configurable-table system" note —
  neither panel is a table. **Recent rides**: "Ride history →" (to `/activity` —
  there's no cross-bike ride-history route, and the Activity page's kind filter is a
  saved preference, not a URL param); one grid row per ride (`display: contents`
  rows so columns line up): "Nov 16" | name over "{sport} · {bike}"
  (`rideSportLabel` → `formatSportType`, `utils/recentActivity.ts`/`utils/strava.ts`)
  | moving time | distance. The whole row opens `RideDetailModal`
  (`docs/rides-and-activity.md`), which holds Log service, Re-sync and Link gear. A
  no-bike ride gets the orange-light tint and an orange "No bike". Empty: "No rides yet."
  **Recent service**: "Activity log →" (`/activity`); each row a primary dot, the
  entry's own `summary` (never recomposed), and a dimmed "Nov 14 · {bike}" — "(off
  bike)" when the entry has no bike, which for a session-less event means the
  component wasn't mounted when it was serviced (the feed resolves an event's bike
  at `performed_at`). A session's summary already names its bike, so that row shows
  it twice — the price of not inventing a second wording. Click targets match the
  activity log's: an event → `/components/:id?event=:id`, a session →
  `ServiceSessionViewModal`, a swap → the installed component. Empty: "No service
  logged yet." `formatRemaining` (the
  "N km left"/"N km overdue" wording, with an optional third, moving-time argument — see "Service intervals and maintenance alerts" above) lives in
  `utils/serviceInterval.ts` so `ComponentDetail`'s own rows share one wording;
  the dashboard's Up next and cards use `formatDrivingRemaining` instead (driving
  dimension only, "over" rather than "overdue").

**`useSyncCompletionWatcher()`** (`frontend/src/hooks/useSyncCompletionWatcher.ts`)
is the **only** place a completed Strava sync invalidates ride data. It's mounted
once, in `Layout.tsx`, which wraps every authenticated route. `POST /strava/sync` only
enqueues `StravaSyncJob`, and completion used to be detected only by the page that
pressed the button — whose polling died the moment the user navigated away
mid-sync, leaving e.g. the Dashboard's sync status stale until a reload. The
watcher polls `GET /strava/status` every 2s while it reports `sync_in_progress`
(any kind, started from any page, tab, device, or the scheduler — see "Strava
integration") and not at all otherwise, keeps the last-seen `last_synced_at`/
`last_full_sync_at` in a ref (seeded on the first load without invalidating),
and calls `invalidate(queryClient, ...RIDE_DATA_GROUPS)` (`api/invalidation.ts` —
every ride-derived query) whenever either changes; it does nothing while Strava
isn't connected. A sync started elsewhere while nothing is polling is still
caught on the next window focus (TanStack's default `refetchOnWindowFocus`), and a
reload mid-sync resumes polling because the first status read already says
`sync_in_progress`. Never on a failure — nothing changed. `useSyncStrava`'s own
`onSuccess` only invalidates the `gear` group (`['strava']`): refetching the status
right after the enqueue is what switches the watcher's polling on.

**`useStravaSyncRunner({ full })`** (`frontend/src/hooks/useStravaSyncRunner.ts`)
is per-button state only, shared by both sync triggers on both pages (Dashboard's
"Sync now"; the Strava page's "Sync now" *and* "Refresh all rides," each its own
instance): the pending state, a matching failure message, and the still-running
hint. It neither invalidates nor polls on its own — it reads the same
`['strava', 'status']` query **without** a `refetchInterval`, because TanStack gives
each observer its own interval timer and only dedupes fetches already in flight,
so two pollers on one key would mean two requests per tick. While pending, it
watches `last_synced_at`/`last_full_sync_at` (whichever matches `full`) for a
change, *and* `last_sync_failed_at` for a change whose `last_sync_failed_kind`
matches `full ? "full" : "incremental"` (the kind check matters because the two
aren't mutually exclusive — only the full path is lock-guarded, so an incremental
and a full run can be in flight at once). The hook returns `{ sync, syncing,
status, error, failure, stillRunning }`. A matching failure sets `failure: { code,
retryAt }`, rendered via the shared `syncFailureMessage` (`utils/strava.ts`) —
`rate_limited` names the retry time, `auth_failed` pairs with a "Connect to
Strava" action, `strava_unavailable`/`unknown` are plain copy. The poll cap (30s
incremental, 3 minutes for `full: true`) is a plain timer, not a check that only
runs when a poll lands — polling stops by itself once `sync_in_progress` clears, so
a cap checked on each poll could never fire for a run whose flag cleared early.
Reaching it with neither a success nor a matching failure sets `stillRunning:
true` — a neutral "still running in the background" message; the watcher still
refreshes everything whenever the job does finish.

