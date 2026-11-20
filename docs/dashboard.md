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
  `last_sync_failed_kind` — the sync strip shows one generic failure line
  regardless of full vs incremental, leaving that detail to the Strava page's own
  status) — this is what lets the sync strip's failure item survive a page reload
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
  of its own to pre-fill with otherwise) and `setting_event`.
- **`recent_rides`** — every activity in a rolling 14-day window (not
  calendar-day-sensitive, so no `tz` needed) plus `summary: {count, distance_meters}`.
  Each ride carries `elapsed_time` (seconds, null when Strava omitted it) so
  "Log service after this ride" can prefill the session at the ride's end.
  Each ride's `counted_toward` (which components its mileage counts toward) comes
  from `Maintenance::CountedTowardQuery.call(user, since:)`
  (`app/services/maintenance/counted_toward_query.rb`) — one batched SQL query
  (`strava_activities` ⨝ `component_assignments` ⨝ `components` on `bike_id` + the
  assignment window + ride_context) for the whole window at once, the same
  batching precedent as `Maintenance::BatchedPositionQuery`. `indoor` comes from `StravaActivity#indoor?` (mirrors the `.indoor`/`.outdoor`
  scopes for one already-loaded record). `gear_id` rides alongside a `null` bike
  specifically so the frontend can offer "Link Strava gear" only for the
  fixable-via-gear-mapping case, same distinction as `sync.unattributed.with_gear`.

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
converts to UTC for the actual query range. Nothing is persisted — if more of the
app ever needs a real per-user timezone, that's a `User#time_zone` column, a
genuine data-model change deliberately not made speculatively here.

**Frontend**: `Dashboard.tsx` owns the one `useDashboard(tz)` query plus a
`useStravaSyncRunner({ full: false })` for its "Sync now" button — see
`useStravaSyncRunner` below for what that hook actually does (polling goes through `GET /strava/status`, shared with the Strava page). `components/dashboard/`:

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
  track it as retired, or don't track it" guidance lives where the user actually acts on it: a one-line hint above the
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
  "Not mounted" last; each row reads `"{component label} — {requirement name}"`
  plus a `(from {setting_event's service type})` clause once a real service has
  been logged; "Log service" reuses `MaintenanceEventFormModal` as-is, pre-filled
  with the item's **position-1 satisfier** — `[...item.satisfiers].sort((a, b) =>
  a.position - b.position)[0]`, same default-satisfier convention as
  `ComponentDetail`'s own split button), `RecentRidesTable` (its "No bike" rows
  link to `/strava?tab=rides`; its "Link Strava gear" link, shown only when
  `gear_id` is present, to `/strava?tab=gear`; a trailing "Actions" column holds
  the shared `LogServiceAfterRideButton` — see "Ride history" — left empty for a
  ride with no bike). `RecentRidesTable` is a plain
  Mantine `Table` in a horizontal-scroll wrapper, **not** the
  sortable/configurable-table system above — that mechanism exists for a
  `TableViewPreference` row's worth of persisted column choices/ordering, which
  this fixed, non-configurable 14-day feed has no use for. `formatRemaining` (the
  "N km left"/"N km overdue" wording, with an optional third, moving-time argument — see "Service intervals and maintenance alerts" above) lives in
  `utils/serviceInterval.ts` so `AttentionRow` and `ComponentDetail`'s own rows
  share the exact same wording rather than re-deriving it.

**`useSyncCompletionWatcher()`** (`frontend/src/hooks/useSyncCompletionWatcher.ts`)
is the **only** place a completed Strava sync invalidates ride data. It's mounted
once, in `Layout.tsx`, which wraps every authenticated route. `POST /strava/sync` only
enqueues `StravaSyncJob`, and completion used to be detected only by the page that
pressed the button — whose polling died the moment the user navigated away
mid-sync, leaving e.g. the Dashboard's sync strip stale until a reload. The
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

