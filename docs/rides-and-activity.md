# Ride history and Activity log

> Reference material split out of CLAUDE.md. A quoted cross-reference such as "see \"Strava integration\"" names a `##` section heading; CLAUDE.md's "Further docs" list says which docs/ file holds each heading.

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
pagination's shared ordering. `Maintenance::RideContextSql`'s `outdoor_predicate`/`indoor_predicate` (which its `predicate` composes) ensure this filter and `StravaActivity.outdoor`/
`.indoor` stay one rule, not a third hand-rolled copy; `Maintenance::CountedTowardQuery`
takes optional `bike:`/`activity_ids:` params alongside `since:`,
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
mislead against a server-paginated list. A page does this by never including its configurable columns in `sortColumns`, and by passing `sortable={false}` to `DraggableHeaderCell` so those columns don't visually invite clicks they can't act on.

Frontend: `components/bike/RideHistorySection.tsx`, mounted on `BikeDetail.tsx`
directly after Component History, at the same heading level. Adopts the
configurable-table system (`table_key: "bike_rides"`) the same way as `Bikes.tsx`;
`useBikeRides` is a `useInfiniteQuery` with a "Load
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
  `Activity::Feed::MERGE_TOLERANCE` (1 minute, a `<=` comparison) of the removal's
  `ended_at`. The one-step swap endpoint (`ComponentAssignments::Swap`, see
  "One-step component swap" below) always produces an exactly-equal boundary,
  which this tolerance already covers without relying on it at all — it's the
  older, hand-made two-action path (Remove, then Install separately) this
  tolerance actually exists for: two separate requests can never land on the
  exact same timestamp, so that real swap always has a small real gap. The
  tolerance is the same small, clock-skew-sized allowance this codebase already
  uses elsewhere (`ServiceSession::FUTURE_TOLERANCE`, `StravaCredential`'s
  refresh buffer), not a new fuzzy-matching concept. Merging is a post-hydration,
  in-memory pass over one
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
  evidence demanded them.
- **Frontend**: `pages/Activity.tsx` (`/activity`, nav item "Activity"), gated on
  `activity_log`'s `TableViewPreference` resolving first, same two-component
  wrapper/Inner split as every other adopter. Split into
  `components/activity/useActivityFilters.ts` (all filter state and derived query
  params, including the kind-chip persistence below and the rideOnly/sort-metric
  reset), `ActivityFilters.tsx` (the chips/filter-bar UI), `ActivityTable.tsx` (the
  desktop table, plus `ActivityRow`/`NonRideCellContent`/exported `RideRowActions`),
  `NarrowActivityCard.tsx`, and `EmptyState.tsx` — `pages/Activity.tsx` itself is
  just the page shell (preference-query gating, wiring the hook to
  `useActivityFeed`, expanded-session/modal state, choosing table vs. cards).
  Kind chips (Rides/Service/Setup
  changes, at least one always selected) persist in that *same*
  `TableViewPreference` row as this table's own column/sort prefs, via
  `useTableViewPreferences`' `extraData` option (see "Sortable, configurable
  tables" above) — not a second preference row. Bike/component/date-range/name-
  search filters and the order/sort-metric controls are local, unpersisted state,
  same convention as the Rides tab's own filters; the date/distance sort control
  only renders when `kinds` is exactly `["ride"]` (mirroring the backend's `422`
  rule), else a dimmed hint takes its place. The table's configurable columns
  (`ACTIVITY_LOG_COLUMNS` in `constants.ts`) spread in
  `SHARED_RIDE_COLUMN_RENDERERS` wholesale plus this page's own `bike` column (the
  one ride column no other adopter needs, since every other one is already scoped
  to a bike or shows it as its own pinned column). Pinned: a 28px icon-only gutter
  (every row, including rides, via `@tabler/icons-react` ),
  then Date, then Name. A ride row renders normally through every visible column; a
  non-ride row renders the gutter icon and Date, then one `<Table.Td
  colSpan={1 + orderedColumns.length}>` absorbing the Name slot and every
  configurable column into a single summary cell on a
  `var(--mantine-color-gray-light)` surface — the `+1` for Name is why the span
  tracks column visibility automatically rather than needing its own state. A
  `service_session` row has a chevron expanding into indented sub-rows (component +
  service type + note) and opens `ServiceSessionViewModal` on click;
  `maintenance_event` links to `/components/:id?event=<id>`
  (`ComponentServiceAndHistory` reads that param and scrolls to/highlights the
  matching history row, the same `?gear=<id>` convention `Strava.tsx` already used
  for "Resolve gear"); `setup_change` links to the installed component, with a
  second small link to the replaced one when the row is a merged entry. Ride row
  actions: "Log service after this ride" (only when the ride has a bike — opens
  `BatchServiceModal` with that bike and `moved_at + elapsed_time` as `initialPerformedAt`),
  "View on Strava", and `ResyncRideButton` reused as-is. Deliberately no "change
  bike" action — a tooltip on the Actions header explains why (fix it on Strava,
  then Re-sync). Below 768px width the table swaps for a card list
  (`components/activity/NarrowActivityCard.tsx`) — ride cards keep date/name/bike/distance/moving time and
  the same row actions; non-ride cards stay single lines, already compact enough.
  Invalidation: `['activity']` is in the `history` invalidation group (see "Cache
  invalidation" under Conventions), used by every mutation whose data this feed reads —
  ride/gear decisions and reassignment, a bike's `strava_gear_id` edits, every
  maintenance event and service session mutation, and component assignment
  create/update/delete.

**Not built**: week/month/year grouping headers with subtotals (shared with Ride
history); a weekly distance chart stacked by bike; a ride detail drawer; threshold
markers on the ride that pushed a requirement into warning/due; a "since last
service" component-filter option; CSV export — all explicitly deferred.

