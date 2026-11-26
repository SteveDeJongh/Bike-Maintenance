# Frontend UI patterns: tables, theming, layout, PWA

> Reference material split out of CLAUDE.md. A quoted cross-reference such as "see \"Strava integration\"" names a `##` section heading; CLAUDE.md's "Further docs" list says which docs/ file holds each heading.

## Sortable, configurable tables

Built from reusable pieces, not a one-off for any single page — in production use
on two tables: the Strava page's Rides tab and the Assignments list (each its own
`table_key`: `strava_rides`, `assignments`). The Bikes list, the Components list, the
bike page's installed components and the Maintenance page were tables too; they're now
`DataList`s ("Bikes page", "Components page", "Bike page" and "Maintenance page"
below), still saving through `useTableViewPreferences` (`bikes`, `components`,
`bike_installed_components`, `maintenance_events`). The bike page's old History and Ride history tables are
gone; their `bike_history`/`bike_rides` preference rows are unused.
- **The Activity page isn't a table**, but it reuses the hook and the picker. It's a
  grouped `DataList` (see "Shared building blocks" below and
  `docs/rides-and-activity.md`), whose `activity_log` preference
  stores its Fields, header sort, `kinds` and `group_by` through
  `useTableViewPreferences`.
- **`ColumnPicker`** splits into the popover and **`ColumnPickerPanel`**, the checklist
  itself, which also works inline. It takes two optional props:
  - `maxVisible`, a cap that disables further checkboxes with a hint;
  - `renderTarget`, a custom trigger such as Activity's "Fields" button;
  - `lockedColumns`, always-shown fields listed first as checked, disabled rows with a
    lock, never dragged and outside the cap.

  Tables pass none of them.
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
  the component that calls this hook until that query has resolved (`Assignments.tsx`
  gates on its preference query before rendering its table). If a page ever needs to swap
  `tableKey` on an already-mounted component (e.g. tabs that don't unmount), it must
  force a remount via `key={tableKey}` rather than relying on the hook to notice the
  change. An optional `extraData` getter lets a page keep one more piece of state in
  the same `TableViewPreference` row alongside columns/sort, spread into every save
  the hook makes so toggling a column never silently drops it (a `PATCH` replaces the
  whole `data` value, no deep merge) — Activity, Bikes, Components and Maintenance
  keep their kinds, filters and grouping this way; the tables omit it.
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
  plain, non-clickable text when `false`, for a table whose configurable columns are
  drag-to-reorder only, never click-to-sort (no current table uses it).
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
  across every adopter so far: Bikes' Name, the Bike detail
  tables' Category+Component, Assignments' Component+Bike) — not just "the most important field." A row can have more than
  one pinned column when its identity genuinely needs more than one coordinate
  (Category+Component; Component+Bike) rather than one. If a column that becomes pinned isn't linked yet, add the link as part of adopting this —
  "pinned" is expected to mean "clickable" everywhere in the app.
- **Card view**: below the shared `useIsMobile()` breakpoint
  (see "Layout and navigation" below), a configurable table renders as cards
  instead of a `<Table>` — column drag-to-reorder has no good touch equivalent
  (the drag handle and touch-scroll gestures would fight each other), and a
  desktop-width table just doesn't fit a phone screen regardless.
  `frontend/src/components/datatable/DataCardList.tsx` renders one `Card` per
  row: the table's own pinned column(s) as the tappable title (whatever link
  target the desktop table already uses — "pinned" already means "clickable"
  per the rule above, so the card title is never a new navigation target), an
  optional badge row next to the title (e.g. Bikes' "Retired"), every visible
  configurable column as a compact label/value pair in the user's saved
  order (a pair is hidden outright when its value is empty/`null`/the table's
  own `"—"` placeholder — a card has no column header to make an empty cell
  self-explanatory the way a table row does), and the row's actions behind a
  44px "⋯" `ActionIcon`/`Menu` in the corner, never inline, so a destructive
  action is never one accidental tap away. Neither `ColumnPicker` nor any drag
  handle renders in card view — column layout stays a desktop-only account
  preference; a card simply reflects whatever's currently saved.
  `frontend/src/components/datatable/MobileSortControl.tsx` is card view's
  replacement for click-to-sort (no column headers to click): a compact
  `Select` of the table's sortable columns plus a ▲/▼ direction toggle, same
  glyphs the desktop header cells use. It requires
  `useTableViewPreferences`'s `setSort` to take an optional explicit
  `direction` argument — picking a new column keeps the current direction
  instead of resetting it, and the toggle button keeps the current column —
  but still saves through the exact same `PATCH` path as a desktop header
  click, so a sort chosen on the phone is the one desktop sees next. A table
  with no click-to-sort at all would render no `MobileSortControl`, matching having
  no sortable `DraggableHeaderCell`s on desktop. `Assignments.tsx` is the reference implementation for both pieces, the
  same role it already plays for the table/column-picker side — it reuses the
  exact sorted array the desktop table already computes rather than duplicating
  the sort logic for cards.
  Card view's own breakpoint (`useIsMobile()`) and the nav shell's CSS
  breakpoint (`sm`) land on the same side at exactly 768px wide — see
  "Layout and navigation" below for why that boundary had to be made exact,
  rather than relying on two independently-resolved breakpoints to agree by
  coincidence.
- **Tables with card view**: `assignments`.
  `assignments`' card uses a two-line title (Component, then Bike dimmed underneath,
  both independently tappable) for its two pinned columns: a card's title slot
  always carries every pinned column, arranged to read naturally for that table.
  `DataCardList` carries an optional `onRowClick` prop for a card that opens
  something on tap.
- **`strava_rides` (the Strava page's Rides tab) deliberately has no card
  view** — it has per-row bulk-select checkboxes, a "select all"/"select all
  matching" toolbar, and conditional row actions (Ignore/Un-ignore/Resolve gear),
  none of which `DataCardList`
  supports; it still only scrolls horizontally on mobile (`Table.ScrollContainer`).
  Giving it a real card view needs a deliberate design decision first (most
  likely either a selection-aware extension of `DataCardList`, or its own
  bespoke card component) — revisit if this is genuinely painful on a
  phone in practice, rather than guessing at an interaction now.

**To adopt this on a new or existing table**, define on the frontend (nothing to
build on the backend — `TableViewPreference`/`/table_view_preferences/:table_key` is
already generic): a `tableKey` string unique to that table; a column-keys constant +
display-label map + default-visible subset (mirroring `BIKE_LIST_COLUMNS`/
`BIKE_LIST_COLUMN_LABELS`/`DEFAULT_BIKE_LIST_COLUMNS` in `constants.ts`); a
sort-keys constant if any pinned column should be sortable too (mirroring
`BIKE_LIST_SORT_COLUMNS`, which adds `'name'` on top of the toggleable columns); a
`columnValue` map (comparable value per sortable column, `null` for "not
applicable" — always sorts last) and a `columnRenderer` map (display `ReactNode` per
column) keyed the same way `Assignments.tsx` does. Call `useTableViewPreferences` with
those constants, then render pinned columns by hand and map the configurable ones
through `<DraggableHeaderCell>`/`columnRenderer`, with `<ColumnPicker>` as the final
header cell — `Assignments.tsx` is the reference implementation to copy the shape from.
**A new adopter must render both views** — the desktop `<Table>` and, below
`useIsMobile()`, `<MobileSortControl>` (when it has any sortable column) plus
`<DataCardList>` fed the same `orderedColumns`/`columnLabels`/`columnRenderer` —
not just the table; `Assignments.tsx` is the reference shape for both. Don't add new
per-row computed/aggregated columns to a list page without checking whether the
underlying data is already batched for that scale (see `Component#total_distance`'s
note above) — this mechanism makes columns easy to add, but doesn't change the cost
of computing what's behind them.

**Non-configurable tables** (a plain `<Table>` with no `TableViewPreference` behind
it — the Settings pages, the component page,
`ServiceSessionViewModal`, the Strava page's gear tables) need the same phone-width
consideration without any of this mechanism: wrap in Mantine's own
`Table.ScrollContainer` with a sensible `minWidth` so the table scrolls
horizontally instead of overflowing the page. Skip the wrapper only for a table
genuinely short enough to fit at 390px wide (2–3 short text columns, no inputs).

## Shared building blocks

Three pieces pages build on, so summary rows, lists and section headings look and behave
the same.

- **`TileRow`** (`components/TileRow.tsx`): the row for summary tiles (Home, Activity,
  the Bikes pages).
  - `<TileRow label="Summary" minTileWidth={140}>{tiles}</TileRow>`. The tiles stay the
    page's own; the layout is `.tile-row` in `index.css`.
  - It never wraps. Tiles share the width (`flex: 1 1 0`) down to `minTileWidth`, so on
    a laptop nothing scrolls. Only then does it scroll sideways: snapping tile to tile,
    no scrollbar, and a body-coloured fade on each edge with more to see.
  - The fades come from `useHorizontalOverflow`, whose edge maths is `overflowEdges`
    (`utils/horizontalOverflow.ts`).
  - The row is a `role="group"` named by `label`. Tiles aren't focus stops.
  - Minimums today: Home 220px, Activity 140px, Components and Maintenance 150px.
- **`DataList`** (`components/datalist/`): the list style for anything that isn't a
  configurable `<Table>`. Activity, the Bikes table, the Components list, the bike
  page's installed components and Rides, the Bike setup checklist and the Maintenance
  page use it.
  - **`DataList`** `({ template, minWidth, stacked })`: one CSS grid in a Paper, which
    scrolls sideways inside itself below `minWidth`. `stacked` drops the grid for a
    phone layout.
  - **Columns:** `dataListTemplate({ leading, main, fields })` builds the template
    (fixed leading tracks, one flexible main track, one per field), and
    `dataListMinWidth` its minimum width.
  - **Field widths:** `fieldMinWidth(label, valueMin = 84)` is a field column's
    minimum: wide enough for its values and for its header label (estimated at 6.5px a
    character plus the sort arrow). Every DataList uses it both for the field's
    `minmax(<min>px, auto)` track and in `dataListMinWidth`, so a narrow page scrolls
    the list sideways instead of squeezing the headers together.
  - **`DataListHeader`** `({ columns, sortColumn?, order?, onSort? })`: the darker band of
    small dimmed labels. Each column is `{ key, label?, sortable?, align?,
    description?, hint? }`, one per track. Sortable ones show an arrow when active and call
    `onSort`; the caller decides the first direction and the flip. A list that doesn't
    sort (Bike setup) leaves out the sort props and marks every column `sortable:
    false`. `hint` is a dimmer second part after " · " ("Label · blank uses brand +
    model").
    - **Labels never overlap:** each stays on one line and truncates with an ellipsis
      (the text, never the arrow). The full label shows in a tooltip when it's cut off.
      A column with a `description` always gets a tooltip ("Total time · Over the
      component's whole life").
  - **`DataListRow`** `({ ariaLabel, onOpen, tone, stacked })`: the whole row is a
    button (Enter/Space, the caller's accessible name), styled by `.data-list-row`.
    Without `onOpen` it's a plain row on the same grid and styling, with no button role,
    hover or click: the Bike setup checklist's rows, which are full of inputs, are these.
    `tone` is `warning` (the no-bike orange), `muted` (a retired or already-tracked row),
    `highlight` (a deep-linked row), `error` (a row the server rejected) or `session`
    (a service session's header and its services on the Maintenance page: half the
    band background, via `color-mix`).
  - **`DataListBand`** `({ title, aside })`: a full-width row between data rows, such as
    Activity's week bands and the Maintenance page's month and component bands.
  - **Alignment:** the header and every row are subgrids of the one parent grid, so a
    field column is as wide as its widest value across all rows and cells always line
    up. Each child of a row is one cell, and a cell may span tracks (`gridColumn`).
  - **`FieldsPicker`**: the "Fields" pill over `ColumnPicker`, with a cap and optional
    locked fields (`fieldPickerState`, `canToggleField`, `canAddField` in
    `dataListModel.ts`). A `ColumnOption`'s optional `description` shows under its
    checkbox. Saving stays with the caller's `useTableViewPreferences`.
- **`PageSection`** (`components/PageSection.tsx`): a section heading on the page
  background, used by the bike page's sections.
  - `<PageSection id title summary foldedSummary actions storageKey>{body}</PageSection>`.
  - **Left:** a chevron button (rotated −90° when folded; `aria-expanded`,
    `aria-controls` the body, "Collapse/Expand <title>"), then the title (`Title
    order={3}`; a click on it folds too, as a mouse shortcut) over a dimmed summary.
  - **Right:** the section's actions, wrapping under the title on a phone.
  - **Body:** the content, usually its own Paper panel, in Mantine `Collapse` with
    `keepMounted={false}`. A folded body isn't rendered, so its queries don't run until
    it's opened. Reduced motion gets a 1ms transition, not 0: a 0ms one fires no
    `transitionend` and `Collapse` would never finish.
  - **Folded,** the summary switches to `foldedSummary`, which says what's hidden.
  - **Remembered per device** in localStorage (`utils/collapseState`, `useCollapsed`),
    keyed per section and shared across bikes: `bikePage.collapsed.installed`,
    `.serviceHistory` and `.rides` (`BIKE_SECTION_STORAGE_KEYS`). Not per account: Rides
    may be folded on a phone and not on a desktop. Every read and write is guarded, and
    anything unreadable means open. Without a `storageKey` a section starts open.
- **When to use which:**
  - summary numbers go in a `TileRow`;
  - a list whose rows open something goes on `DataList`, and so does a list of rows of
    inputs (plain rows, no `onOpen`);
  - a bike page section's heading is a `PageSection`;
  - a dense, column-configurable management table with a mobile card view stays a
    configurable `<Table>` ("Sortable, configurable tables" above).

## Bikes page

`/bikes` (`pages/Bikes.tsx`, `components/bikes/`), in the Home/Activity look.

- **Header:** "Bikes" with a dimmed "3 active · 1 retired" (`bikesHeaderLine`), and a
  primary **+ Add bike** (`BikeFormModal`, then `/bikes/:id/setup`).
- **Tiles** (`BikesSummaryTiles`, a `TileRow` at 160px): Active bikes, Total distance,
  This year, Components tracked, and "Service due · soon" (orange when non-zero).
  `bikeTileTotals` sums them over active bikes.
- **Toolbar** (`BikesToolbar`):
  - **Left:** Cards | Table, then (cards) the card sort: Most urgent, Last ridden,
    Distance, Name.
  - **Right:** "Show retired bikes", plus (table) `FieldsPicker`.
  - **Phone:** always cards, so the switch and Fields are hidden and the sort always
    shows. The saved view is untouched.
- **Saved view** (`useBikesView`): the `bikes` `TableViewPreference` holds the table's
  `columns`/`sort_column`/`sort_direction`, plus `view` (`cards`/`table`), `card_sort`
  and `show_retired`, each save sending the full object. Unknown saved values fall back
  to cards, Most urgent and retired hidden.
- **Cards** (`BikeListCard`): an auto-fill grid,
  `minmax(min(380px, 100%), 1fr)`, so a phone doesn't overflow.
  - **Each card** is one link to the bike, with nothing clickable inside. It shows:
    - the name, a type chip, make/model and `BikeStatusChip`;
    - Total, This year, Rides and Avg power;
    - **Components:** up to three mounted parts (`next_service`), each a `WearBar`
      and `componentWearValue`: what's left or over, or, for a part with no interval,
      "7,744 km total" over a faint empty track. Then a dimmed "+X more components…"
      (`moreComponentsLine`), plain text since the card is a link. With nothing
      installed: "No components installed.";
    - the last ride (`lastRideLine`; the year only when it isn't this year, via
      `formatShortDate`, which Home's panels share), pinned to the card's bottom.
      Grid items stretch, so cards in a row match in height and their last-ride
      lines line up.
  - **Sorts** (`sortBikeCards`): Most urgent is Home's `sortByUrgency` on
    `status_counts`; Last ridden is newest first; Distance is highest first; Name is
    A–Z.
  - **`AddBikeCard`** closes the grid: a button that opens the new-bike modal, with a
    separate link to the Strava gear tab.
  - **Retired bikes,** when shown, follow as slim muted rows (`RetiredBikeRows`): the
    name, "Retired Mar 2025", the total distance, rides, and the years ridden
    (`retiredYearRange`).
- **Table** (`BikesTable`, a `DataList`):
  - **Columns:** the name in bold over make/model, then the chosen Fields
    (`BIKE_LIST_COLUMNS`: Type, Status, Distance, This year, Rides, Last ride, Avg
    power, Time, Elevation, First ride, Purchased on, Installed components; the first
    seven are the default).
  - **Cells:** Status is a chip. Distance is bold, and other metrics are dimmed and
    right-aligned.
  - **Sorting:** header click sorts, starting A–Z for text and biggest-first for
    numbers and dates; clicking again flips it. Status sorts by urgency.
  - **Order** (`sortBikesTable`): retired bikes last with a muted row, whatever the
    sort; nulls last.
  - **No row actions:** the row opens the bike, and Edit/Delete are in the bike page
    header's "⋯" menu.
- **Data:** `GET /bikes` (`BikesController#index`, `?tz=`) adds `ride_count`,
  `distance_this_year` (from local Jan 1), `last_ride_activity_type`,
  `status_counts` and `next_service` to the stats it already returned. `next_service`
  is up to three mounted components: those with an enabled requirement first (due,
  warning, then ok; highest `fraction_used` first), then, to fill the three, those
  with none, in category order (`Component::CATEGORY_ORDER`, a copy of the
  frontend's `COMPONENT_CATEGORIES`; custom categories after) and then by label.
  - **Batching:** every stat is one grouped query, and statuses come from one
    `worst_result_by_component` call, so adding bikes adds no queries (a spec checks).
  - **Lifetime totals** for parts with no requirement come from the batched
    `Maintenance::LifetimeDistanceQuery`.

## Components page

`/components` (`pages/Components.tsx`, `components/componentList/`), in the
Bikes/Activity look.

- **Terms** (`componentState`, `utils/componentState.ts`; see
  `docs/components-and-setup.md`, "Installed, spare and retired"): every count, pill,
  band and Bike cell goes through it.
- **Header:** "Components" with the dimmed "Every part you track, on a bike or on the
  shelf", and a primary **+ New component** (`ComponentFormModal`).
- **Tiles** (`ComponentsSummaryTiles`, a `TileRow` at 150px, `componentTileCounts`):
  Installed, Spares, "Service due · soon" (orange when either is non-zero), With
  intervals ("9 of 37") and Retired. They count the whole list, whatever the filters.
  Due, soon and With intervals count non-retired components, spares included, so a
  spare chain that needs waxing shows. With intervals means at least one enabled
  requirement.
- **Toolbar** (`ComponentsToolbar`, Activity's shape; `Dot`, `Pill` and `FilterMenu`
  are shared from `components/toolbar/ToolbarPills.tsx`):
  - **Row 1, left:** Installed / Spare / Retired toggles, with a dot (primary, blue,
    grey) and a count. The default is Installed + Spare.
  - **Row 1, right** (from `sm`): Group by Category | Bike | None, then
    `FieldsPicker`. On a phone a **View** button opens `ComponentsViewSheet` (Group
    by and Sort) instead, and Fields is hidden.
  - **Row 2:** search ("Search name, brand or model", over label, brand and model),
    then single-select Category, Bike and Service status (Due, Soon, OK, No interval)
    pills, then Clear filters when any of those is set. The Bike filter matches
    installed components on that bike plus spares and retired components last on it.
    "Soon" is the warning status.
- **Saved view** (`useComponentsView`): the `components` `TableViewPreference` holds
  `columns`/`sort_column`/`sort_direction` plus `states`, `group_by`, `category`,
  `bike_id` and `service`, each save sending the full object. The search text isn't
  saved, as on Activity. Unknown saved values fall back to the defaults, and a saved
  category or bike that no longer exists reads as unset. Columns saved by the old
  table (`service_status`, `current_bikes`) fall back to the default Fields
  (`componentListPreferenceData`). The server checks `group_by` per table key.
- **List** (`ComponentsList`, a `DataList`):
  - **Component** (main): the label, with brand · model dimmed under it.
  - **Bike** (`ComponentBikeCell`):
    - **Installed:** the bike, linked, and "since Nov 2". A shared indoor cassette
      reads "Juan Solo +1" (the band's bike first under Group by Bike) and "Trainer
      only, shared".
    - **Spare:** "Spare" in blue, then "Last on <bike>" or "Never installed".
    - **Retired:** "Retired Mar 2", then "Last on <bike>".
  - **Service** (`ComponentServiceCell`): the worst enabled requirement's `WearBar`
    plus `componentWearValue` ("4 km left", "16 days left", "120 km over"). With no
    requirement it shows a faint bar and "No interval". A rotating spare serviced since
    it came off reads "Wax · ready" in teal (`spareReadyLabel`).
  - **Fields** (`COMPONENT_LIST_FIELDS`): Lifetime (bold) and Acquired by default,
    then Brand, Model, Category and Retired on, sized with `fieldMinWidth`.
  - **Retire** stays as a small pill at the end of each non-retired row (kept on
    purpose) and opens `RetireComponentModal`. The row opens `/components/:id`. Edit
    and Delete aren't on the list.
  - **Sorting** (`sortComponents`): header click on every column. **Service** is most
    urgent first (due, warning, then ok, highest `fraction_used` first), with no
    interval always last. **Bike** goes installed by bike, then spares by last bike,
    then never installed, then retired. Lifetime and the dates start biggest/newest
    first; clicking again flips it. Ties go A–Z by label.
  - **Grouping** (`groupComponents`, `DataListBand`s; sorting applies within each):
    - **Category** (default): one band per category in the app's order
      (`useAllCategories`).
    - **Bike:** one band per bike with installed components, A–Z. A shared cassette
      appears under each bike it's on. Then Spare, then Retired (when that pill is
      on).
    - **None:** a flat list.

    Bands read "Chain · 4 · 1 due · 2 soon" (`bandSummary`), with zero parts left out.
    Grouping is done in the browser from the payload.
  - **Empty states:** "No components yet" with + New component, and "No components
    match these filters" with Clear filters (or a hint when every state pill is off).
  - **Phone:** stacked rows, each with the name and Retire, the bike line on one row,
    and the wear. The bands stay.
- **Data:** `GET /components` (`ComponentsController#index`) adds, batched:
  - `WearFields` from one `worst_result_by_component`;
  - `has_enabled_requirement`;
  - `lifetime_distance_meters` (`Maintenance::LifetimeDistanceQuery`);
  - `assigned_since` (the earliest open assignment's `started_at`);
  - `rotates`;
  - `latest_service` (`Maintenance::LatestServiceQuery`, one `DISTINCT ON`);
  - `worst_requirement_name`, the driving requirement's name from the same worst
    result (the Log service picker's "Wax due" chip).

  "Ready" is decided on the frontend from these raw values and
  `last_bike.removed_at`.

## Component page

`/components/:id` (`pages/ComponentDetail.tsx`, `components/component/`): the one
place for a part's whole life. Everything comes from `GET /components/:id`.

- **Header** (`ComponentPageHeader`):
  - a dimmed "← Components" link;
  - the label with a category chip and a status chip: the worst *enabled* interval as
    Due, Soon or OK (`worstRequirementStatus`), none without intervals, and "Retired
    <date>" once retired;
  - a dimmed line: brand/model · "Acquired <date>" · where it is
    (`componentPlacement`/`placementText`). That reads "On Soloist since Oct 15 · All
    rides", lists both bikes for a shared cassette, or says "Spare · last on <bike>",
    "Never installed", or, once retired, "Last on <bike>". Bike names are links;
  - the notes;
  - **actions:** Log service (primary, no service type preselected), Edit, Retire or
    Un-retire, and a ⋯ menu with **Delete**. Delete is enabled only when the payload
    says `deletable`; otherwise the menu shows "Has history. Retire it instead."
    (see "Deleting a component" in `docs/components-and-setup.md`). Confirming
    deletes the component, then returns to `/components`.
- **`MaintenanceAlertBanners`,** scoped to the component.
- **Tiles** (`ComponentStatTiles`): Lifetime distance, Lifetime time, Total climb,
  Avg power (from `lifetime_stats`), Installations and Services.
- **Service intervals** (`ComponentIntervalsSection`, a `PageSection`):
  - **Summary:** "2 intervals · 1 due" (`intervalsSummary`; due and soon among
    enabled intervals).
  - **Pills:** "+ Add from category defaults" opens the inline checklist, and
    "+ Custom interval" opens `AddCustomServiceIntervalModal`.
  - **Rows** (a grid, `.interval-row` in `index.css`; a phone stacks it): enabled
    first, disabled ones muted with an "Off" chip. Each row shows:
    - the name with a status chip, and the rule (`requirementRuleText`: "Every 200 km
      or 90 days · Drip wax or Immersion wax");
    - a wear bar with "196 / 200 km since Drip wax" (`requirementProgressText`);
    - what's left in the status colour;
    - "Last done Nov 14" / "Since install";
    - an edit button (`EditServiceIntervalModal`, or the inline
      `CustomRequirementEditor` for a custom interval);
    - a ⋯ menu: Log <service> per satisfier (with the "also clears" confirm),
      Enable/Disable, turn the **category's** notifications off or on, Dismiss until
      next sync (warning/due only), and Delete.
  - The editor pieces are in `components/serviceIntervals/`.
- **Maintenance history** and **Installation history:** side by side in a wrapping
  flex (`1 1 520px` / `1 1 440px`), each a `PageSection`.
  - **Maintenance** ("7 events"): date | a teal wrench | the service with a note line
    (`eventNoteLine`: the notes, "Session with <others>", "Off the bike") | "at
    1,160 km" (distance at service; see "Core logic" in `docs/data-model.md`). Newest
    first, ten then "Show all". A row opens its session's `ServiceSessionViewModal`,
    or else the event's edit form. **`?event=<id>`** (from Activity and the bike page)
    shows that row: it unfolds the section (`PageSection`'s `openOnMount`), scrolls to
    the row, highlights it (`DataListRow`'s `highlight` tone) and opens it.
  - **Installations** ("3 installations · 2 bikes", `installationsSummary`): every
    assignment, newest first. Each row has a bike icon (primary while current), the
    bike with a "Current" chip and "Jun 2 → Sep 30, 2026 · Trainer only"
    (`installationRangeText`), and the stint's distance. A row opens that
    installation's `AssignmentDetailModal`.
- **Collapse keys:** `componentPage.collapsed.intervals`, `.maintenance` and
  `.installations`, remembered per device (`componentSections.ts`).
- **`#intervals`** (the installation modal's "No service intervals" link) scrolls to
  Service intervals and unfolds it.

### Installation modal

`AssignmentDetailModal` (`components/forms/`, pieces in `components/installation/`)
is a **quick look at one installation**. The component page is the home for
everything else: editing intervals, maintenance history and every installation.
- **Opened from:**
  - the bike page's installed components and component history rows;
  - Home's bike cards;
  - Activity's setup rows;
  - the component page's Installation history.

  It reads the assignment from the bike's `GET /bikes/:id` (all assignments, current
  and ended) and the component's `GET /components/:id`, and follows the slot after a
  swap.
- **Title:** "INSTALLATION · <CATEGORY>" over the label, like the ride modal.
- **Where it is** (`whereItIs`):
  - current: "On <bike> since <date>", the `RideContextChip` ("All rides" as text),
    and "· also on <bikes>" for a shared cassette;
  - past: "Was on <bike> · <start> → <end>" and the chip.
- **Current installations** also get:
  - the **Swap** pill;
  - Log service, Edit installation and Remove from bike (`installationActions`);
  - a read-only **Service status**: one row per enabled interval with "Last done …",
    a wear bar and what's left (`serviceStatusRows`), or "No service intervals"
    linking to the component page's `#intervals`.

  **Past** ones get only Edit installation and no service status, since the intervals
  describe the component now, not that stint.
- **Both** show **This installation** (Distance, Time, Elevation, Avg power when
  metered) with "Lifetime across all installations: <km> · <hrs>" under it.
- **Footer:** "Open component page →".
- **Links out** close the modal first.

## Bike page

`/bikes/:id` (`pages/BikeDetail.tsx`), in the Home look. The page only assembles
sections; each one loads its own data. Top to bottom: header, tiles, banners, Up next
and rotation (`BikeOverviewRow`), then three collapsible `PageSection`s: Installed
components, Service & component history, and Rides.

- **`BikePageHeader`:**
  - **Above it:** a dimmed "← Bikes" link.
  - **Left:**
    - the name, the type chip, and `BikeStatusChip` (`bikeStatusCounts` of
      `overview.mounted`, Home's rule), or "Retired Mar 2025" for a retired bike;
    - a dimmed line of make/model · `Linked to Strava gear "…"` (or "Not linked to
      Strava gear", a link to the gear tab) · "Riding since …".
  - **Right:** Log service (the batch service modal), Set up components, and a ⋯ menu
    with Edit bike and Delete bike.
  - **There's no separate retire action:** a bike is retired with Edit bike's "Retired
    on" date, which doesn't end its assignments (unlike a component's Retire).
- **`BikeStatTiles`:** a `TileRow` of Total distance, This year (from local Jan 1),
  Moving time, Elevation, Avg power and Rides.
- **`MaintenanceAlertBanners scope={{ bikeId }}`**, unchanged, under the tiles. They
  partly duplicate Up next: same requirements, but banner-eligible ones only, with
  dismiss actions.
- **The card row:** a wrapping flex row.
  - **`BikeUpNext`** (`flex: 2 1 520px`) is Home's `upNextItems` on
    `overview.attention`/`upcoming`. Each row is laid out on the card's grid: the part
    and requirement over "196 / 200 km" | `WearBar` | what's left, in the status colour
    | an outline Log service (`LogServiceForItemButton`, shared with Home's
    `UpNextRow`).
  - **`RotationCard`** (`flex: 1 1 340px`): one per `rotationGroups(mounted, off_bike)`
    group (a rotating category with a mounted part and an off-bike partner), stacked.
    Each has the shared `RotationSplitBar` (also Home's strip), the
    `rotationSummaryLine` and a hint to swap with the pill. With no rotation there's no
    column, and Up next takes the full width.
- **`InstalledComponentsCard`** (a `DataList`; columns and sort in the
  `bike_installed_components` preference):
  - **Section header:** "Installed components" with "13 installed · 1 empty slot", and
    the Fields and "+ Track component type" (`addableSlotOptions`) pills as actions.
    Folded: "13 installed · 1 due · 2 soon · 1 empty slot" (`installedFoldedSummary`;
    soon is warning, zero parts dropped). The panel holds only the DataList. The part
    that renders it stays mounted while folded (Fields needs its preference state); only
    the list is skipped.
  - **Columns:** Category (the default sort, by the bike page's category order:
    `orderSlots`) | `ComponentSwapPill` | Ride context (a chip for indoor-only or
    outdoor-only, dimmed "All rides" for both) | Wear
    (`WearBar` plus `componentWearValue`, from `overview.mounted`; a faint bar and "No
    interval" without one) | Fields (defaults: This install, Lifetime in bold,
    Installed on). The whole-life metrics are labelled Lifetime, Total time, Total
    climb and Avg power, and this install's are This install, Time, Elevation and Avg
    power. `INSTALLED_COMPONENT_COLUMN_DESCRIPTIONS` tells the two spans apart in the
    header tooltip and the Fields picker.
  - **Rows:** built by `installedRows` (an unsplit slot takes any open assignment of its
    category; a split slot only its own context). A filled row opens
    `AssignmentDetailModal` and has no buttons. **Remove from bike** lives in that
    modal.
  - **Empty slots** stay in place, muted, with `EmptySlotPill`: a dashed menu that
    installs a component immediately (`useInstallComponentForm`'s defaults: the bike's
    `created_at` for a slot with no history, else now; the category's default ride
    context for an unsplit slot), creates one, or stops tracking the slot.
    Eligibility is `activeElsewhereByComponent` plus the shared-indoor rule; retired
    components aren't offered. Start date and ride context can be changed afterwards
    with Edit installation.
  - **Phone:** the same rows stacked: category, pill, wear, and the fields on one
    dimmed line.
- **Service & component history** (`BikeServiceHistorySection`): "Latest 5 of each",
  with the two cards below side by side (each `flex: 1 1 460px`, wrapping).
  - **Folded:** "18 services · 22 component changes" (`serviceHistoryFoldedSummary`).
    Services is the service feed's `kind_counts.service`. The section and
    `BikeServiceCard` both use `bikeServiceFeedParams`, so it's one cached request,
    which still runs while folded. Changes is `historyRows(...).length`.
- **`BikeRidesSection`:** "Rides", "N on this bike", and "Open in Activity →"
  (`activityUrl`). Folded: "214 on this bike · last ride today" (`ridesSummary`;
  today, yesterday, or `formatShortDate`). The list is a child component, so a folded
  Rides never fetches the feed. The body is the Activity page's `ActivityList` on the activity feed
  (this bike, rides), with the saved Fields and Group by (`readActivityView`, read
  only), a header sort of its own that isn't saved, Load more, and `RideDetailModal`.
  There's no odometer column and no indoor/outdoor filter; the feed has neither.
- **`BikeServiceCard`:** the bike's latest 5 service items from the activity feed
  (date | wrench | `ServiceChips`), and "All N →" to Activity filtered the same way. A
  session opens `ServiceSessionViewModal`; a session-less event opens its component.
- **`ComponentHistoryCard`:** ended installations, latest first (`historyRows`).
  - **Wording:** "Chain S2 → Chain S1" when another installation in the same category
    and ride context starts at the instant this one ended (how the one-step swap
    writes it), else "Removed …".
  - **Each row:** the category and distance ran underneath, and the lifetime distance
    on the right.
  - **Five show;** "All N →" expands in place, then "Show less". A row opens its
    installation modal.
- **Data:** `GET /bikes/:id` (`?tz=`) computes statuses once and adds `ride_count`,
  `distance_this_year`, `strava_gear` (`{ gear_id, name }`, the name from the gear
  cache) and `overview`.
  - **`overview.attention` and `overview.upcoming`** come from `Maintenance::UpNext`
    with `bike_id:`: parts mounted on this bike only, and its own nearest five ok
    items.
  - **`overview.mounted` and `overview.off_bike`** come from `Bikes::CardComponents`.
  - **Both builders** are the same ones Home's `GET /dashboard` uses.

## Maintenance page

`/maintenance-events` (`pages/MaintenanceEvents.tsx`, `components/maintenanceLog/`),
in the Activity look. The nav item and heading say "Maintenance". The route kept its
old path.

- **Naming:** user-facing text calls one `MaintenanceEvent` a **service** and a
  `ServiceSession` a **service session**, everywhere on this page and in
  `MaintenanceEventFormModal` ("Log service", "Edit service", "Delete service").
- **Header:** "Maintenance" with the dimmed line "Every service you've logged, in
  sessions or one at a time". On the right:
  - **Log service** (outline) opens the Log service modal with no component, so
    it starts with the component picker (see "Log service modal" below).
  - **Log service session** (primary) opens `BatchServiceModal` for
    `defaultSessionBike`: the active bike ridden most recently, else the first by name,
    switchable in the modal's header. It's disabled with no active bike. Both session
    modals are documented in `docs/service-requirements.md`, "Batch service logging".
  - **On a phone:** "86 services this year" replaces the dimmed line, and one 44px Log
    service menu offers "One component" and "Service session on a bike".
- **Tiles** (`MaintenanceLogTiles`, a `TileRow` at 150px, `maintenanceTiles`):
  - Services this year, Sessions (this year) and Last service, from `meta.tiles`. These
    are unfiltered, and "this year" is in the viewer's zone.
  - **Due · soon**, orange when non-zero. It's `componentTileCounts` over
    `useComponents()`, the Components tile's own count, so the two pages can't
    disagree.
  - **Most serviced** ("Chain S1 · 14"), this year.
- **Toolbar** (`MaintenanceLogToolbar`, Activity's shape):
  - **Row 1, left:** the Sessions (filled teal dot) and Single events (teal ring) pills,
    each with a count. At least one stays on.
  - **Row 1, right:** Group by Month | Component | None, then `FieldsPicker` (cap 5).
  - **Row 2:** the search ("Search service, component or note"), then Bike, Category
    and Service type `FilterMenu`s and `DateRangePill` (`components/toolbar/`, shared
    with Activity; presets from `presetRange` in `activity/dateRanges.ts`; default
    This year, "All time" clears it). Clear filters shows when anything differs from
    the defaults.
  - **Phone:** a full-width search and a View button, badged with the number of
    non-default choices (`viewBadgeCount`), that opens `MaintenanceLogViewSheet` (the
    kind pills, Group by, Sort and Fields). The filter pills scroll sideways under it,
    and the targets are 44px.
- **Saved view** (`useMaintenanceLogView`): the `maintenance_events`
  `TableViewPreference` holds:
  - `columns`, `sort_column` and `sort_direction`;
  - `kinds`, `group_by`, `bike_id`, `category` and `service_type_id`;
  - `date_preset` (`"all"` for All time) and `date_range` (a custom from/to).

  Every save sends the full object. The search text isn't saved. `readMaintenanceView`
  validates it all on load, and the old table's columns fall back to the default
  Fields. The server checks `group_by` (`month`, `component`, `none`).
- **List** (`MaintenanceLogList`, a `DataList`; `buildMaintenanceRenderList` decides
  the rows):
  - **Columns** (`maintenanceListLayout`): Date (day over date) | an icon gutter |
    Service | the Fields | a trailing column for "View session ›".
    - **Service:** the type, its time, a "↺ Wax" outline chip per requirement it
      resets, and the notes dimmed under it.
    - **Fields** (`maintenanceLogFields.ts`): Component (linked, category under it),
      Bike ("Off the bike" dimmed), Component km (bold) and Since last by default.
      Category, Bike km and Logged on are available too.
  - **Service sessions:** a header row (wrench, "Service session", time, a teal
    "3 services" chip, the note, the bike, "View session ›") with its services under
    it on a teal line-and-dot gutter. Both use the `session` tone. When filters hide
    some services the chip reads "2 of 3 services". A session split across Load more
    pages keeps one header.
  - **Grouping:**
    - **Month** (default): bands "November 2026 · 18 services · 5 sessions · 9
      components", with totals from `meta.month_totals`. They're right across Load
      more, and a month has one band. The date shows on each day's first row.
    - **Component:** a band per component ("Chain S1 · 14 services",
      `meta.component_totals`) and no session headers. A session's service gets a
      dimmed "Session" link instead.
    - **None:** no bands, and every row shows its date. Session headers stay.
  - **Sorting:** Date (default newest first), Component km and Since last, by header
    click. A field sort flattens the list (no bands or session headers) with a dimmed
    note under the toolbar. The saved grouping returns with Date.
  - **Clicks:** a session header opens `ServiceSessionViewModal`, and a service opens
    `MaintenanceEventFormModal` in edit mode, which now has **Delete service**. The
    Component link only navigates. The accessible names read "Drip wax, Chain S1,
    Nov 14, open".
  - **Empty states:** "No services logged yet" (no last service at all) with Log
    service, otherwise "No services match these filters" with Clear filters.
  - **Footer:** Load more and "Showing 14 of 86".
- **Phone:** the same list stacked. Each band becomes a small header above its own
  card (`splitIntoCards`).
  - **A service:** the icon, the type, the date on the right, then "Chain S2 · Off the
    bike · at 1,020 km" (`phoneMetaLine`).
  - **A session:** a header (icon, "Service session", date, "Libre CR/DL · 3
    services"), then its services indented, type over component, with the component km
    on the right.
- **Data:** `GET /maintenance_events` is `Maintenance::EventLog`, scoped through
  `current_user`.
  - **Params:** `kinds[]` (`session`, `single`), `bike_id`, `category`,
    `service_type_id`, `from`/`to` with `tz`, `q`, `group`, `sort` (`date`,
    `component_km`, `since_last`), `order`, and `cursor` or `page`, `per_page`.
  - **Returns:** `{ events, sessions, meta, next_cursor }`.
  - **One base relation** for the page, the counts and the band totals.
    - **The bike** is the session's bike, or for a single service the bike its
      component was on at `performed_at`. That's `Maintenance::EventBikeSql`, shared
      with `Activity::Feed`. Both the Bike filter and the Bike column use it.
    - **`q`** matches the service type name, the component's label, brand and model,
      the service's notes and its session's notes. A session-note match brings in
      every service in that session.
  - **Paging:**
    - **Date order** (Month and None): keyset on `(performed_at,
      COALESCE(service_session_id, 0), id)`. A session's services share
      `performed_at`, so they stay together.
    - **Component grouping and the field sorts:** offset paging. The field sorts
      compute over the whole filtered set, then slice. That's fine at hundreds of
      services; a cached distance would be the next step if it ever isn't.
  - **Per service, all batched:**
    - **Component km at the service:** `Maintenance::EventDistanceQuery`, shared with
      the component page's history. It counts rides before `performed_at` under the
      assignments' `RideContextSql`.
    - **Since last:** the difference from the previous service of the same type on the
      same component, across all the user's services whatever the filters
      (`LAG(id)`); null for the first. A split indoor/outdoor slot counts only its own
      rides.
    - **Bike km:** the bike's rides before `performed_at`, as its odometer counts them;
      null off the bike.
    - **`resets`:** the names of the component's enabled requirements whose effective
      satisfiers include the type, today's ones (`satisfier_owner`/`effective_name`).
  - **`sessions`:** by id, with `event_count` and `matching_count`.
  - **`meta`:**
    - `total`;
    - `kind_counts`, under every filter but kinds: sessions counted as sessions,
      single services as services;
    - `tiles`;
    - `month_totals` for the page's months, with local month bounds from Ruby's zone
      via `width_bucket`;
    - `component_totals`.
- **Invalidation:** the key is `['maintenance_events', 'log', …]`. That's in `history`
  (every service and session write, rides, assignments, bikes) and in `intervals`,
  because requirement and satisfier edits change the reset chips.

### Log service modal

`MaintenanceEventFormModal` (`components/forms/`, pieces in `components/logService/`,
pure logic in `logServiceModel.ts`): logging or editing **one service** on one
component. Every single-service entry point opens it; a fresh form mounts on every
open, so a reopened modal starts from its opener's component and type again.

- **Versions:**
  - **Log from the Maintenance page:** no component, so the component picker
    comes first and everything below says "Pick a component first".
  - **Log from a component** (`defaultComponentId`): the component page's Log
    service, its intervals rows' split button (`defaultServiceTypeId` too), Home's
    Needs attention / next service, and the installation modal. No picker.
  - **Edit** (`event`): from a row on the Maintenance page or the component page's
    maintenance history.
  - **Edit in session:** an edit whose event has a `service_session_id`.
- **Title** (`LogServiceTitle`, lifted like the installation modal's): "LOG
  SERVICE" / "EDIT SERVICE" over the label, a neutral category chip, and "On
  <bike> since <date> · 1,356 km lifetime" (`componentPlacement`; bikes linked;
  "Off the bike · last on <bike>" for a spare, "Retired · last on …"). Without a
  component it reads "One component", with "Doing several on one bike? Log a
  service session" when the opener passes `onLogSession` (the Maintenance page,
  which closes this and opens `BatchServiceModal` for its default bike).
- **Component picker** (`ComponentPicker`, a Mantine `Combobox` with
  `Combobox.Search`): closed, the label, "Chain · on Juan Solo · 1,356 km lifetime"
  (`pickerLine`) and the worst requirement as a chip ("Wax due" red, "Clean soon"
  orange; `statusChip` from `worst_requirement_name`). `componentPickerGroups`, from
  `useComponents()`: Needs attention (due, then soon, most used first), one group per
  active bike A–Z in category order (a shared cassette under each bike), Spares
  ("last on …", and `spareReadyLabel`'s "<type> · ready" chip), and Retired behind
  the footer's "Show retired". A component in Needs attention also shows in its own
  group. Search matches label, brand and model across every group. Switching
  component keeps the date and notes, and keeps the type when it's one of the new
  component's pills or a type tagged for (or universal to) its category
  (`serviceTypeAfterComponentChange`) — tags filter, they never forbid — else takes
  the new default.
- **Service** (`ServicePills`, `servicePills`): one pill per satisfier of the
  component's enabled requirements, requirement then position order, with the
  requirement dimmed inside ("Drip wax · Wax"; a type satisfying two names both),
  then up to three recent other types logged on it, then a dashed **Other type ▾**:
  the shared `ServiceTypePicker` through its `renderTarget`, scoped to the category,
  inline create included. The selected pill is primary-tinted with a primary border.
  The default (`defaultServiceTypeId`) is the opener's type, else the first satisfier
  of the most urgent requirement (worst status, then most used).
- **Done on** (`DoneOnField`): the date/time picker with **Now** and **After last
  ride** (when the latest ride this component counted toward, before the modal
  opened, ended: `moved_at + elapsed_time`, never after now), and "Last ride before
  this: Hill repeats, Nov 14, 9:15 am" for the chosen time. Both come from
  `useLastRideBefore`, `GET /activity?kinds[]=ride&component_id=&before=&per_page=1`
  (its `component_id` filter is exactly "counted toward": assignment windows and
  ride context). Edit in session: disabled with a lock, "Part of the <date> service
  session on <bike> · change the date there" (`useServiceSession`), the link opening
  `ServiceSessionViewModal` stacked on top; no shortcuts.
- **Notes:** `ServiceNotesField` ("Notes · optional", "Products used, what you
  noticed"), shared with `BatchServiceModal`.
- **What this resets** (`ResetsPanel`, `resetRows`): an inset panel, one row per
  enabled requirement — name and rule (`requirementRuleText`), the current
  `WearBar`, and the outcome. A satisfier of the chosen type gets an arrow to a
  near-empty teal bar and "196 km → 0 · resets" (the used amount on the driving
  dimension); the rest read "Not affected" with the name dimmed. With no
  requirements: "No service intervals on this component" and a link to
  `/components/:id#intervals`. Editing: "What this service reset", bars dimmed,
  and "Reset at 1,160 km" (the component's distance at the service). It reflects
  today's requirements.
- **Footer:** Delete (outline red, edit only, the existing confirm) on the left;
  Cancel and the primary on the right — "Log Drip wax" (`primaryAction`), or Save
  changes when editing, disabled with a tooltip reason ("Pick a component first",
  "Pick a service type").

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
  The modal's sticky header gets the same dark-6 as its content, so it doesn't
  show as a black band. Non-full-screen modals also get a 1px edge: `dark-4` with
  `--mantine-shadow-xl` in dark mode, and the default border colour with Mantine's
  own shadow in light mode. Full-screen (mobile) modals skip it.
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

## Layout and navigation

The app works as one responsive web app on desktop and phone — no separate
native client. `frontend/src/components/Layout.tsx` (the authenticated
route tree's shell, rendered by `RequireAuth`) swaps between a desktop
sidebar and a mobile bottom tab bar at Mantine's `sm` breakpoint (48em /
768px) .

- **`frontend/src/hooks/useIsMobile.ts`** is the one shared breakpoint
  check for anything that needs real JS branching (not just CSS
  visibility) — `useMediaQuery(MOBILE_BREAKPOINT_QUERY, false, {
  getInitialValueInEffect: false })`. `MOBILE_BREAKPOINT_QUERY` is
  `` `(max-width: ${em(767.98)})` ``, **not** a plain `(max-width: 768px)` —
  Mantine's `sm` breakpoint (the nav shell's own CSS, `AppShell.Navbar`'s
  `breakpoint="sm"` among others) resolves to `min-width: 48em`/768px
  exactly, so a JS query that's inclusive of 768px would disagree with that
  CSS at the exact boundary (CSS: desktop; JS: mobile, both true at once).
  `em(767.98)` lands a hair under 48em instead, so the two can never both
  match at the same width . `index.css`'s iOS-input-zoom fix uses the same
  `767.98px` value for its own media query, for the same reason — keep
  both in sync if this breakpoint ever changes. The
  `getInitialValueInEffect: false` option matters too: Mantine's hook
  otherwise returns a default value on the first render and only corrects
  itself one render later inside a `useEffect`, which would flash the
  desktop layout on a phone for a frame — this app is pure CSR (no SSR), so
  reading `window.matchMedia` synchronously on the first render is always
  safe and skips that flash entirely. Anything that needs the viewport width in JS reuses this — never a fresh media query.
- **iOS input zoom**: Safari zooms the whole page in when a tapped input's
  font-size is under 16px, and Mantine's default `sm` inputs render at
  14px. `index.css` bumps every editable field to 16px below the
  `767.98px` breakpoint only (desktop keeps Mantine's own sizing) via three
  classes confirmed empirically against this app's actual rendered markup,
  not assumed from Mantine's docs: `.mantine-Input-input` (every field
  built on the base `Input` component — `TextInput`, `NumberInput`,
  `Select`, `Autocomplete`, `Textarea`, and every `@mantine/dates` input,
  which all reuse the same component under the hood), `.mantine-
  PillsInputField-field` (`MultiSelect`/`TagsInput`'s own typing field — a
  different internal component, so it doesn't carry `Input-input`), and
  `.mantine-PasswordInput-innerInput` (`PasswordInput` renders its field as
  its own "innerInput" part rather than reusing `Input-input` either).
  Checkbox/Radio inputs are excluded — nothing to type into, no zoom risk.
  Deliberately not a disabled-zoom viewport meta (`user-scalable=no`/
  `maximum-scale=1`) — that breaks pinch-zoom accessibility for everyone,
  not just this one input-focus case.
- **Prefer Mantine's `hiddenFrom`/`visibleFrom` props, or a component's own
  native per-breakpoint config, over `useIsMobile()`** wherever a plain CSS
  show/hide is enough — pure CSS can never flash, since the browser
  resolves it before paint, with no React render involved at all. `Layout`
  itself needs no JS breakpoint check whatsoever: `AppShell`'s `navbar`
  prop has a real per-breakpoint `collapsed: { mobile, desktop }` config
  (hidden entirely below `sm`, no burger toggle, no React state), the
  header's `UserMenu` is wrapped in `visibleFrom="sm"`, and the footer
  (which has no equivalent per-breakpoint `collapsed` config of its own —
  just a plain boolean) is instead given a **responsive height** object
  (`{ base: <height>, sm: 0 }`) so it collapses to zero through the exact
  same breakpoint CSS `navbar.breakpoint` uses. Never drive a shell piece's visibility from `useIsMobile()`: two different visibility mechanisms for the same boundary can disagree right at it (at exactly 768px both the sidebar and the tab bar would show); one mechanism can't. (A 0-height footer
  still needs an explicit `overflow: hidden` — a 0-height box doesn't clip
  its children by default, so the tab labels' own intrinsic line-height
  otherwise peeks out below the page on desktop.)
- **`frontend/src/components/navDestinations.ts`** is the single config
  array every nav surface reads from — `NAV_DESTINATIONS` (path, label,
  a `@tabler/icons-react` icon, and an optional `tab: true` flag), in the
  desktop sidebar's own display order. `TAB_DESTINATIONS` (built from a
  separate `MOBILE_TAB_ORDER` path list — the tab bar's own order,
  Home/Bikes/Activity/Components, isn't the same as the sidebar's) and
  `MORE_DESTINATIONS` (everything without `tab: true`) are both derived
  from the one array, never a second hand-maintained list. Adding a page
  later means adding one entry here and deciding whether it's a tab or
  goes in the mobile "More" sheet — the sidebar always shows all of them.
  `isDestinationActive(destination, pathname)` is the one active-route
  rule every surface uses: exact match for `/` (Home), prefix match for
  everything else — so `/bikes/:id`/`/bikes/:id/setup` highlight Bikes,
  `/components/:id` highlights Components, and `/settings/*` highlights
  Settings, with no per-item overrides.
- **Mobile's "More" sheet** (a bottom `Drawer`, opened by the tab bar's
  fifth slot) lists `MORE_DESTINATIONS` plus two items that aren't nav
  destinations at all — "Account settings" (a direct link to
  `/settings/account`) and "Sign out" (an action, not a route) . The More tab itself shows
  active whenever the current route matches any `MORE_DESTINATIONS` entry
  (via the same `isDestinationActive`), and tapping any item inside the
  sheet closes it.
- **The iPhone home indicator**: `index.html`'s viewport meta carries
  `viewport-fit=cover` (required before `env(safe-area-inset-*)` resolves
  to anything on iOS at all — without it every inset reads as `0`). The
  tab bar's own height is a `calc()` of a fixed content height plus
  `env(safe-area-inset-bottom)`, which is what `AppShell` reads to reserve
  the right amount of bottom padding under page content automatically —
  the inset itself is applied as the footer's own `padding-bottom`, below
  the fixed-height tab row, not stacked on top of it.
- **`SettingsLayout.tsx`** (its own always-visible sub-nav, next to
  `<Outlet/>`) uses `useIsMobile()`: below `sm` its fixed-width vertical sidebar would force the page
  wider than the viewport, so it swaps for a horizontally scrollable row
  above the content instead of overflowing.
- **`frontend/src/components/AppModal.tsx`** is the one shared wrapper every form modal renders through — **new modals must
  use this instead of Mantine's `Modal` directly.** On mobile it goes
  `fullScreen` with a slide-up transition (every modal is easier to use
  that way on a phone, and the `size="xl"` ones — `BatchServiceModal` and
  `CategoryServiceRequirementsModal` — are
  cramped otherwise); desktop keeps each modal's own `size` exactly as
  before. Mantine's own Modal header is already `position: sticky; top:
  0` unconditionally, so close stays reachable above a long scroll with
  no extra work. An optional `footer` prop (adopted by
  `BatchServiceModal` and `MaintenanceEventFormModal`, the two modals
  with one clear primary submit/cancel row) renders that row `position:
  sticky; bottom: 0` — respecting `env(safe-area-inset-bottom)` — on
  mobile, inline exactly as before on desktop.
  `CategoryServiceRequirementsModal` has no such single row (it's a
  management surface — a scrollable list of templates, each
  independently editable — not one form), so it doesn't use `footer`;
  its own two nested sub-forms (new template, apply-to-components) each
  sticky their *own* action row the same way via a local
  `StickyMobileActions` helper instead. `BatchServiceModal`/
  `CategoryServiceRequirementsModal` additionally only mount `AppModal`
  (and everything inside it) while actually open — unlike every other
  modal, their content owns a live per-instance query
  (`useServiceableComponents`, the templates list) not worth keeping
  alive just to animate a close, so closing them is an instant unmount
  with no exit transition; every other modal's `AppModal` stays mounted
  through `opened` flipping to `false` so its close transition can play.
- **Date pickers on mobile**: `frontend/src/components/
  MobileDatePickerDefaults.tsx` (wraps `<App/>` in `main.tsx`, nested
  inside the outer `MantineProvider`) sets `dropdownType="modal"` on
  every `DatePickerInput`/`DateTimePicker` below the mobile breakpoint —
  a popover-anchored dropdown clips or gets pushed off-screen inside an
  `AppModal` that's gone `fullScreen`, since there's no sensible anchor
  point left. It's a *nested* `MantineThemeProvider`, not a plain
  `createTheme()` call like `main.tsx`'s own `DateTimePicker` format
  defaults, specifically because it has to react to `useIsMobile()` —
  Mantine's theme `components` defaultProps mechanism is otherwise a
  static object, not responsive to viewport size. `DateInput` (9 usages)
  is deliberately excluded — unlike `DatePickerInput`/`DateTimePicker`,
  it doesn't extend `PickerInputBase` and has no `dropdownType` prop at
  all in this Mantine version; swapping those 9 usages to
  `DatePickerInput` just to gain modal mode would trade `DateInput`'s
  direct-keyboard-entry typing for a click-to-open-calendar UX, a real
  behavior change, not a drop-in — left as a plain popover on mobile
  instead.
- **Touch targets**: any small tappable element in a
  place a phone user actually taps gets a `MOBILE_TAP_TARGET_STYLE`
  (`frontend/src/utils/touchTarget.ts`, `minHeight`/`minWidth: 44` via
  `inline-flex` centering, so it grows the tappable box without changing
  the element's own visual size) — gated behind `useIsMobile()` wherever
  the same element also renders on desktop (the dashboard `BikeCard`'s
  bike-name link and "Log service" button, `UpNextRow`'s "Log
  service" button, the bike page's Up next Log service), or applied
  unconditionally in a component that only ever renders on mobile.
- Every route under `Layout` either is a top-level `NAV_DESTINATIONS`
  entry, a settings sub-page reachable from `SettingsLayout`'s own
  always-visible sub-nav, or already has a visible "Back to…" link
  (`BikeDetail`, `ComponentDetail`, `BikeSetup`) — confirmed deliberately,
  since an installed PWA has no browser back button to fall back on.

## PWA

Installable (`manifest.webmanifest`, home-screen icons, standalone
display) so the app can be added to a phone's home screen and launch
without browser chrome — no offline support or push notifications yet;
both are deliberately deferred (no service worker in this app at all).

- **`frontend/public/manifest.webmanifest`**: `name`/`short_name`,
  `start_url`/`scope` both `/`, `display: "standalone"`. `background_color`
  and `theme_color` are both the **dark-mode body color**
  (`theme.colors.dark[7]`, `#0A0A0A` — see "Theming" above), not the icon
  artwork's own `#0F3B3A` teal background, so an installed app's splash
  screen matches the page underneath it rather than the icon's own frame.
- **`frontend/public/icons/`**: `icon-192.png`/`icon-512.png` (full-bleed
  standard icons, `purpose: "any"`), `icon-maskable-512.png` (the same
  artwork shrunk to 80% on the same background — Android's masked-icon
  shapes crop into the full-bleed canvas, so maskable art needs that
  margin to avoid losing content at the edges, `purpose: "maskable"`),
  `apple-touch-icon.png` (180×180, iOS's own icon, no manifest support
  needed for it), `favicon-32.png` (the browser-tab icon).
- **`index.html`**: links the manifest and both icons; iOS has no native
  manifest support at all, so the actual "launches standalone, no Safari
  chrome, right name/icon" behavior on iOS comes entirely from
  `apple-mobile-web-app-capable`/`apple-mobile-web-app-title`/
  `apple-mobile-web-app-status-bar-style` metas (plus `mobile-web-app-capable`,
  the non-prefixed equivalent other engines have since adopted — both are
  kept since iOS still only honors its own prefixed one).
  `apple-mobile-web-app-status-bar-style` is `"black"`, not
  `"black-translucent"` — translucent would let page content draw under
  the status bar, which needs `env(safe-area-inset-top)` handling the app doesn't do (only the tab bar's bottom inset is handled — see
  "Layout and navigation" above); opaque `"black"` keeps the status bar
  reserving its own space instead. Two `theme-color` metas, one per
  `prefers-color-scheme`, match `main.tsx`'s light (Mantine's default
  white) and dark (`#0A0A0A`) body colors exactly, same reasoning as the
  manifest's own `background_color`/`theme_color`.
- **iOS standalone auth caveat — to test once deployed** (this can only
  really be verified on the real deployed custom domain over HTTPS, not
  locally): an installed (standalone) iOS PWA keeps its own cookie jar,
  separate from Safari's. Expected behavior per sign-in path, to confirm
  once there's a real deployment:
  - **Email/password** (`/login`): works normally — it's a same-origin
    form POST, never leaves the PWA's own webview, so the session cookie
    lands exactly where it's set.
  - **Strava/Google OAuth**: the redirect to the provider's own domain and
    back may open in an in-app browser sheet (`SFSafariViewController`)
    rather than staying inside the installed app's own webview, depending
    on iOS version and how the link was activated — if so, the callback's
    `Set-Cookie` may land in that sheet's own storage, not the PWA's,
    leaving the PWA looking signed-out even though the browser sheet
    itself shows a successful callback. Needs a real-device check; if this
    bites, the fix is almost certainly on Strava/Google's end (can't
    control how iOS chooses to present an external-domain redirect from
    inside a standalone web app), not something this app's code can patch
    around.
  - **Email verification / password reset links**: these arrive in an
    email client, so tapping one opens Safari (or whatever the system
    default browser is), never the installed PWA directly, regardless of
    platform — by design, not a bug to fix; the resulting session lives in
    Safari's own storage, separate from the PWA's.

