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
takes the page's exact `activity_ids:`, so a page of rides is covered by one query
rather than one per ride. Each ride's base fields come
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

**Ride details modal (`RideDetailModal`).** One modal holds everything about a ride, and
it's opened by clicking a ride in any list. Ride lists carry no ride-level action buttons
of their own.

- **Data:** `components/ride/RideDetailModal.tsx` on `AppModal` (full-screen on
  mobile), reading `GET /strava/rides/:id` through `useRideDetail`. The key
  `['ride_detail', id]` is in the `rides`, `serviceStatus` and `history` invalidation
  groups, so a re-sync, a logged service or a swap refreshes it.
- **Header:** the round primary bike icon and the ride name are the `AppModal` title,
  beside the close button, so they stay pinned on mobile. The name takes two lines,
  then truncates. The body opens with a dimmed "Sun, Nov 22 · 8:12 am · Gravel Ride ·
  {bike link} · Outdoor" (`rideHeaderParts`, `utils/rideDetail.ts`). Without a bike it
  reads an orange "No bike on Strava".
- **Actions**, all `sm` buttons:
  - "Log service" (`LogServiceAfterRideButton` with `label`, filled; hidden without a
    bike). It still prefills the session's date at the ride's end;
  - "View on Strava ↗", an outline button in Strava orange, opening the activity in a
    new tab;
  - Re-sync (`ResyncRideButton` with `variant="default"`, including its 429 retry text);
  - "Link gear" → `/strava?tab=gear`, subtle orange, only when `gear_id` is set and
    `!gear_mapped`.
- **"View on Strava":** Strava's API Brand Guidelines require that exact wording, styled
  bold, underlined, or in Strava orange #FC5200. The button uses
  `color="var(--strava-orange)"`, the app's one external brand colour, defined in
  `index.css`. No ride name links out to Strava directly any more.
- **Stats** (`rideStatLines`), between thin dividers:
  - **Line 1:** Distance, Moving time, Elevation and Avg power, large, with small
    uppercase labels.
  - **Line 2:** Elapsed, Avg speed, Max speed, Weighted, Energy, Avg HR, Max HR
    and Cadence as one-line label/value pairs (an xs dimmed label, then the sm value),
    in three columns (two on a phone). Four would leave about 134px per pair at the
    modal's `lg` width, too close to "Max speed 52.3 km/h" to stay on one line.
  - **Nulls:** hidden, never shown as a dash. A missing line-1 value is filled by the
    next recorded line-2 metric.
- **Components:** "Components" with a dimmed "This ride added {distance} to each"
  right-aligned on the same line. Rows follow the bike page's category order
  (`useAllCategories`, via `sortRideComponents`), then label. Each row is a grid of:
  - the category (`categoryLabel`, xs dimmed, 90px);
  - the name, linked in the default text colour, underlined on hover;
  - the shared `WearBar` (`components/dashboard/WearBar.tsx`, also used by the Home
    bike card) in the status colour;
  - `formatDrivingRemaining` ("132 km left" / "120 km over").

  A component without a requirement shows "{lifetime} total" and a faint empty track,
  so the bars and metrics stay aligned. With
  no bike, the section explains that the ride isn't added to any components, plus Link
  gear when it applies. With a bike but nothing counted, it says "None".
- **Loading:** skeletons. **Errors:** an inline alert.
- **Where it opens.** Each list holds one `rideId` and renders one modal, outside its
  table:
  - **Home, Recent rides:** the whole row.
  - **Bike page, Ride history:** the row or the name, on desktop and mobile.
  - **Strava page, Rides tab:** the name only, so the selection checkboxes keep their
    clicks. Its own cleanup actions (Ignore, Un-ignore, Resolve gear) stay per row.
  - **Activity page:** the ride name, in the table and the narrow cards.

  Names render through `RideNameButton`, which stops propagation so a clickable row
  doesn't open the modal twice. The component chips in the Components column do the
  same.
- **Log service after a ride** opens `BatchServiceModal` for the bike with
  `initialPerformedAt` set to the ride's end (`initialPerformedAtForRide` in
  `utils/rideTiming.ts`: `moved_at + elapsed_time`, or `moved_at` when
  `elapsed_time` is null). It renders nothing for a ride without a bike.

**Terminology.** The components a ride adds distance to are shown as **"Components"**:
- the column label in the bike rides, Strava rides and activity log column sets;
- the "Components" section in the modal.

Details:
- The column key and the API field are still `counted_toward`, so saved preferences and
  existing payloads didn't change. Part 1's ride endpoint calls it `components`.
- An empty cell reads "No bike" for a ride without one, and "None" otherwise
  (`componentsCellState`).

Frontend: `components/bike/RideHistorySection.tsx`, mounted on `BikeDetail.tsx`
directly after Component History, at the same heading level. Adopts the
configurable-table system (`table_key: "bike_rides"`) the same way as `Bikes.tsx`;
`useBikeRides` is a `useInfiniteQuery` with a "Load
more" button (not infinite scroll) plus "Showing N of M". The Name column
(`RideNameButton`) and the row both open `RideDetailModal` (above). `formatSpeed`
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
  **metric-sort** branch (`call_metric_sorted`) that always lists rides only,
  whatever `kinds` asked for (see "Metric sorts" below) — mirroring `Strava::RideLog`'s own
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
  `sort` (`date` or a metric key), `cursor` (opaque, keyset only — base64 of
  `occurred_at|kind_rank|source_id`), `page` (offset, metric sorts only),
  `per_page`. Response: `{ items, meta, next_cursor, rides_only }` — `next_cursor`
  is `null` on the last page, an opaque cursor string for the date branch, or a
  page number (as a string) for a metric sort, so the frontend's `useInfiniteQuery` reads
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
- **`meta.week_totals`** (date order only; absent for metric sorts, `{}` for an
  empty page): `{ "YYYY-MM-DD" => { ride_count, distance_meters, moving_time,
  total_elevation_gain, service_count, setup_count } }`, keyed by the **local Monday**
  (in `tz`) of each week this page's rows touch. The totals are for the **whole week**
  under every current filter, `kinds` included, not just the loaded rows. So a week split
  across two pages reads the same on both, and `per_page` doesn't change them.
  - A kind that isn't selected reports `null`, so the UI can hide it.
  - `service_count` covers sessions plus session-less events, like the "Service" kind.
  - `setup_count` counts **merged** changes: a removal that would merge into a
    "replaced" row (same slot, matching install within `MERGE_TOLERANCE`) isn't
    counted again. So unlike `kind_counts`, a swap counts once.
  - **How it's computed:** week boundaries come from Ruby's zone data, are passed as UTC
    instants and bucketed with `width_bucket`, never `AT TIME ZONE` (see CLAUDE.md).
    Rides use `ride_meta_scope`. Service and setup wrap the same per-kind sub-selects as
    the union, so the filters can't drift from the list's.
- **Metric sorts** (`Activity::Feed::SORT_COLUMNS`): `distance` (the original key) or
  any numeric activity-log column: `distance_meters`, `moving_time`, `elapsed_time`,
  `total_elevation_gain`, `average_speed`, `max_speed`, `average_watts`,
  `weighted_average_watts`, `kilojoules`, `average_heartrate`, `max_heartrate` and
  `average_cadence`.
  - The column comes only from that whitelist, never from the param, and an unknown key
    is a `422` (`InvalidSortError`).
  - Sorting is `NULLS LAST` in both directions, with `id` as the tie-break.
  - Paging is offset, as distance always was. A keyset over a nullable float would need
    null-aware tuple comparisons, for no real gain at this scale.
  - A metric sort **always lists rides only**, and says so with the top-level
    `rides_only: true`, which is `false` for date order. That replaced the old
    `422` for `sort=distance` with other kinds selected.
- **`GET /strava/rides/:id`** (`StravaController#ride`, `Strava::RideDetail`) returns
  one ride for the ride details modal. It's scoped through `current_user`, so another
  user's ride 404s. The payload:
  - **Identity:** `RideSerialization.base_json` plus `trainer`, `indoor` (`#indoor?`),
    `bike`, `gear_id`, `gear_mapped` (a bike of the user's claims that gear) and
    `reason` (same as the feed: `unmapped_gear`/`no_gear`/`gear`/`ride`, null when
    attributed). That's every stored metric, with nulls passed through and never
    zero-filled. `distance_meters` is `NOT NULL DEFAULT 0` in the schema, so it's never
    null.
  - **`components`:** what this ride counts toward, from
    `Maintenance::CountedTowardQuery`, so the indoor/outdoor split cassette matches the
    feed. Each has `component_id`, `label` and `category`, the worst requirement's wear
    (`Maintenance::WearFields`: `service_status`, `fraction_used`,
    `driving_dimension` and the remaining amounts), and `total_distance_meters`
    (lifetime) only when there's no enabled requirement.
- **`group_by`** (`"week"` / `"none"`, absent means week) is stored in the
  `activity_log` `TableViewPreference` beside columns, sort and `kinds`. It's the
  one `data` key the model validates; anything else is a `422`.
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
- **Frontend**: `pages/Activity.tsx` (`/activity`, nav item "Activity") is **one grouped
  list** in the Home page's style. There is no configurable `<Table>` and no separate phone
  cards.
  - **Loading:** the page waits for `activity_log`'s `TableViewPreference`, the same
    wrapper/Inner split as before.
  - **Header:** "Activity", with the dimmed line "Rides, service and setup changes in one
    list".
  - **`ActivitySummaryTiles`:** five compact tiles in a `TileRow` (140px minimum; see
    "Shared building blocks" in `docs/frontend-ui.md`). They show Rides, Distance, Moving time, Elevation and "Service ·
    setup", from the latest page's `meta`.
    - They follow every filter **except** the kind toggles, because `ride_totals` and
      `kind_counts` ignore `kinds`.
    - The setup figure is the raw `kind_counts` count, so a swap counts 2 there, while the
      week bands count it once.
  - **`ActivityToolbar`,** a Paper with two rows:
    - **Row 1:** the kind pills (Rides, Service, Setup), each with a coloured dot
      (primary, teal or blue, `ACTIVITY_KIND_COLOR`) and its count, tinted when selected.
      At least one always stays selected.
    - **Row 1, from `sm` up:** "Group by" (Week | None) and a **Fields** button.
    - **Row 1, on a phone:** a **View** button instead, opening `ActivityViewSheet` (an
      `AppModal`) with Group by, **Sort** (field plus direction, since there are no
      headers to click) and Fields.
    - **Row 2:** a search pill, then **Bike**, **Component** and **Date** filter pills
      (Mantine `Menu`s, tinted when active). "Custom range…" opens a range `DatePicker`
      in a popover. "Clear filters" appears when any filter is set.
  - **Fields** (`activityFields.ts`, `ACTIVITY_FIELDS`):
    - They're the 12 numeric ride metrics, which are exactly the feed's metric sort keys.
      Name, date and type are always shown. Bike and sport type live in a ride's
      sub-line, and Components and Commute in `RideDetailModal`.
    - At most 6 can be shown (`MAX_ACTIVITY_FIELDS`), with reordering by drag.
    - The checklist is the shared `FieldsPicker` (`ColumnPicker` with `maxVisible`), and
      `ColumnPickerPanel` inline in the phone sheet.
  - **`useActivityFilters`** owns the filters, `kinds` and `group_by` (both persisted in
    the same preference row through `useTableViewPreferences`' `extraData`), the fields,
    and the header sort.
    - **`onHeaderSort`:** the active column flips direction, a new field starts at
      biggest-first, and Date goes back to newest-first.
    - **`apiSort`:** `'date'` or the field's key.
    - **`listGroupBy`** (`effectiveGroupBy`): sorting by a field turns grouping off
      without changing the saved Week/None. While a field sort is active, a dimmed
      "Sorted by {field}: showing rides only" note sits under the toolbar, driven by
      the feed's `rides_only`.
  - **`ActivityList`:** a shared `DataList`, scrolling sideways inside its Paper, sized
    by `activityListLayout` (the template and minimum width).
    - **The grid:** `DataListHeader` (Date | icon | Activity | fields, sortable by Date
      and each field, with an arrow on the active one), the week bands (`DataListBand`)
      and every row (`DataListRow`; no-bike rides use the `warning` tone) sit on one
      grid. The header and rows are subgrids of it, so the columns line up.
    - **`buildActivityRenderList`** (`activityListModel.ts`) turns the loaded pages into
      entries.
      - **Week mode** (date order) adds a band per local Monday-start week:
        `weekBandTitle` reads "This week · Nov 16 – 22", "Last week · …" or "Nov 2 – 8",
        handling month and year boundaries and adding the year for another year's week.
        `weekTotalsLine` gives "5 rides · 214 km · … · 2 service", with service and
        setup only when above zero.
      - **Band totals** come from `meta.week_totals` of the **first page that contains
        the week**, so a week split by Load more stays one band. The day label shows on
        each day's first row only.
      - **None mode** has no bands, and every row is dated.
  - **`ActivityRow`:** the date cell, a 32px round kind icon, then the Activity cell (the
    title, the time dimmed beside it, and a sub-line), then right-aligned dimmed metrics,
    with Distance in bold. Service and setup rows leave the metrics empty.
    - **Sub-lines by kind:**
      - **Ride:** "{sport} · {bike}". With no bike it reads "{sport} · No bike on Strava"
        in orange, and the row is orange-tinted.
      - **Session:** "{bike} · N items", plus teal chips "{component} · {service}". That
        replaces the old expand/collapse sub-rows.
      - **Session-less event:** one chip.
      - **Setup change:** the server `summary` as the title, with the bike and any ride
        context as the sub-line.
    - **Click target:** no row actions. The whole row is a `role="button"` target with a
      hover background, Enter/Space, and an accessible name like "Morning loop, Nov 22,
      open details".
    - **What a row opens:**
      - a ride opens `RideDetailModal`;
      - a session opens `ServiceSessionViewModal`;
      - an event navigates to `/components/:id?event=<id>`;
      - a setup change opens `AssignmentDetailModal`, which offers the component page
        when the assignment can't be found.
  - **Phone (`useIsMobile`), the same list:**
    - the column header hides;
    - week bands stay, and days become small headers above their rows;
    - each row stacks the icon, title, time and sub-line, with the fields as one dimmed
      line underneath (`phoneMetricLine`: "48 km · 1.6 hrs · 510 m").
  - **Footer:** "Load more" with "Showing N of M". M is the selected kinds' count, or the
    ride count under a field sort.
  - **`EmptyState`** keeps its clear-filters action, inside a Paper.
  Invalidation: `['activity']` is in the `history` invalidation group (see "Cache
  invalidation" under Conventions), used by every mutation whose data this feed reads —
  ride/gear decisions and reassignment, a bike's `strava_gear_id` edits, every
  maintenance event and service session mutation, and component assignment
  create/update/delete.

**Not built**: month/year grouping (Activity groups by week only) and grouping on
Ride history; a weekly distance chart stacked by bike; threshold
markers on the ride that pushed a requirement into warning/due; a "since last
service" component-filter option; CSV export — all explicitly deferred.

