# Component swap, bike setup, and brand/model autocomplete

> Reference material split out of CLAUDE.md. A quoted cross-reference such as "see \"Strava integration\"" names a `##` section heading; CLAUDE.md's "Further docs" list says which docs/ file holds each heading.

## One-step component swap

Swapping one component for another in the same slot (the main use case: rotating two waxed chains on one bike) is one action with one exact timestamp — not Remove then Install, whose two timestamps land slightly apart (Activity log's `MERGE_TOLERANCE` exists for that path).

- **`POST /component_assignments/:id/swap`** (`{ component_id, swapped_at }`,
  `swapped_at` defaulting to now) ends assignment `:id` at `swapped_at` and
  creates a new assignment for `component_id` on the same bike and slot (same
  `bike_id`, `category`, `ride_context`) starting at exactly that instant, in one
  transaction — a valid, non-overlapping pair because `ComponentAssignment#overlaps?`
  is half-open (see the data model above). `app/services/component_assignments/swap.rb`
  (`ComponentAssignments::Swap`) owns the transaction and every swap-specific
  precondition — same category, not retired, not the same component, `swapped_at`
  after the current assignment's own `started_at` and not in the future (a
  5-minute `FUTURE_TOLERANCE`, same order of magnitude as
  `ServiceSession::FUTURE_TOLERANCE`) — returned as `{ base: [...] }`, the same
  shape this app's cross-user "not found" responses already use for non-field
  errors. Whether the new component is already mounted in a conflicting way is
  deliberately left to `ComponentAssignment`'s own overlap validations, surfaced
  via the new assignment's own `.errors` when `.save` fails, rather than
  re-implemented in the service. The controller scopes both records to
  `current_user` (the existing assignment via the controller's own
  `set_component_assignment`, the new component via `current_user.components.find_by`,
  404ing like every other cross-user access in this controller) and parses
  `swapped_at` before handing off.
- **Where swapping lives: `ComponentSwapPill`** (`frontend/src/components/ComponentSwapPill.tsx`).
  An installed component's name is a two-segment pill: the label links to the
  component, and a chevron (`aria-label` "Swap {label}") opens a Mantine `Combobox`
  of what that slot can take. Choosing an option swaps **immediately**, at now, with
  no confirmation step. A Mantine notification (`@mantine/notifications`) reads
  "Swapped {old} → {new}", or shows the endpoint's message on failure, and the
  pill then stays on the old component. While a swap is running, the chevron shows a
  loader and the pill is disabled. The root stops click propagation, so the label,
  the chevron and the portaled dropdown never trigger a row's own click.
  - **Where it appears:**
    - the bike page's installed-components list (`InstalledComponentsCard`, on desktop
      and phone);
    - `AssignmentDetailModal`'s "Swap" row, for a still-open installation only.
  - **There's no other swap entry point.** ComponentDetail has no Swap button, and the
    bike page's rows have no buttons at all. **Remove from bike** is in
    `AssignmentDetailModal`, for an open installation, opening `EndAssignmentModal`.
    Retire is on ComponentDetail only.
  - **Invalidation:** `useSwapComponentAssignment` invalidates `setup`, `serviceStatus`
    and `history`. `serviceStatus` covers `['bikes']`, `['components']` and
    `['dashboard']`.
- **Eligibility, exactly what the endpoint accepts:** `swapOptions` in
  `utils/swapOptions.ts`, through `useSwapOptions`. A candidate must have the same
  category, not be retired, and not be the current component. It must then be either:
  - a **spare**, with no open assignment; or
  - a **shared indoor cassette**: the category has `allows_multiple_assignments`, the
    slot is `indoor_only`, every one of the candidate's open assignments is
    `indoor_only`, and none is on this bike.

  This follows `no_overlapping_assignment_for_component`, which only lets two
  `indoor_only` assignments of a component overlap in an allows-multiple category, and
  `no_overlapping_assignment_for_bike_slot`, under which a component already on this
  bike conflicts. The rule needs `ride_context` on `current_bikes`, which
  `GET /components` and `/components/:id` now include. A request spec in
  `component_assignments_controller_spec` pins the shared case: a cassette on two bikes
  swaps into a third bike's `indoor_only` slot, and is rejected for `both`,
  `outdoor_only` or a bike it's already on.
- **Dropdown options** show the label, a dimmed brand/model, and a dimmed status:
  "Last on {bike}", "Never installed", or "Also on {bikes} (indoor)".
  - **Order** (`orderSwapOptions`): spares by most recent removal, then
    never-installed spares by name, then shared cassettes by name.
  - **Empty:** one disabled row, "No spare {category}s".
  - **Search** appears when there are more than 6 options.
- **`AssignmentDetailModal`** takes `{ bikeId, assignmentId }` and reads the
  assignment from that bike's `GET /bikes/:id`, which carries every assignment with
  its stats. That's a cache hit on the bike page, and fetched on open from the
  dashboard. After a swap it **follows the slot**: it switches to the new assignment's
  id and shows a loader until the refetch brings it in, so it never shows the ended
  one. There's no single-assignment-with-stats endpoint. If the dashboard's
  whole-bike fetch ever gets slow, that would be the place to add one.
  `ComponentCurrentBike` and `DashboardMountedComponent` both carry an
  `assignment_id`. `ComponentCurrentBike`'s is optional, since only
  `GET /components/:id` sets it.

## Install on bike

Installs start from the component now (the old Assignments page and its New
assignment form are gone; `/assignments` redirects to Activity's setup changes) or
from a bike's empty slot (the bike page's empty-slot picker, unchanged).

- **Entry points** (component page, neither for a retired component): the ⋯ menu's
  **Install on bike…** and Installation history's **+ Add installation**. Both open
  `InstallOnBikeModal` (`components/installOnBike/`, pure logic in
  `installOnBikeModel.ts`), a fresh form on every open.
- **Fields:**
  - **Bike** (`bikeOptions`): active bikes most recently ridden first
    (`compareLastRidden`), retired ones behind "Show retired bikes" for back-filling.
    A bike without a slot for the category reads "Not tracked on this bike"
    (`GET /bikes`' `slot_categories`).
  - **Slot** (`slotOptions`): the bike's slots for the category, each with its ride
    context and occupant ("Chain · All rides · Chain S2 installed" / "… · empty");
    hidden when there's one. Installing now offers only slots `canTakeComponent`
    allows (`utils/swapOptions.ts` -- the swap pill's and empty-slot picker's rule: a
    spare, or a shared indoor cassette for an `indoor_only` slot on another bike); a
    past stint can go in any of them.
  - **Installed on** (date and time, now by default) and **Removed on** (optional,
    "Leave blank if it's still on the bike"). Removed on is required for a component
    that's mounted now (moving it is the swap's job) and for a retired bike. Neither
    may be in the future; Removed on must be after Installed on.
- **What submit does** (`submitCase`):
  - **Removed on set:** `POST /component_assignments` with `ended_at` -- a closed
    stint that never ends or moves another assignment. The model's overlap rules (slot
    and component) decide; a conflict comes back as the usual `:base` 422 naming it,
    shown under the date fields.
  - **Occupied slot, no Removed on:** the swap (`POST /component_assignments/:id/swap`
    on the occupant, `swapped_at` = Installed on), with "This will remove <occupant>
    from <bike> on <date>." and **Swap in**.
  - **Otherwise:** a plain `POST /component_assignments` (**Install**; **Add
    installation** for a past stint from Installation history).
  - The ride context is a split slot's own, else the category's default (the
    empty-slot picker's rule).
- **No slot:** choosing an untracked bike shows "Track <Category> on <bike>". It's
  required (checked, locked) when installing now -- the bike's lineup goes by slots --
  and optional, off by default, for a past stint, which needs no slot (so back-filling a
  part long gone from a bike doesn't add an empty slot to its lineup). It's sent as
  `track_slot: true` on the same `POST`, which creates the bike's `"both"` slot for the
  category and the assignment in one transaction (a failed install leaves no slot).
- **The summary:** "Rides on <bike> from <start> to <end / now> will count toward this
  component." (`attributionLine`) -- a back-filled stint moves those rides' mileage.
- **After success:** the create and swap mutations invalidate `setup`, `serviceStatus`
  (components, bikes, alerts, the dashboard) and `history`; the modal closes and the new
  row is highlighted in Installation history.

## Installed, spare and retired

The one classification of a component's state, `componentState` in
`frontend/src/utils/componentState.ts`. Every count, pill, band and cell uses it, and
nothing re-derives it inline. The three states are mutually exclusive:

- **Retired:** `retired_on` is set. This wins even if an assignment is somehow
  still open; `components:audit_retired_mounted` finds those.
- **Installed:** not retired, with an open assignment (`ended_at: nil`) on any bike.
  A shared indoor cassette is one installed component on two bikes.
- **Spare:** neither; on the shelf.

The Components list's counts are computed on the frontend from the full, unpaged
`GET /components` list, so there's no backend twin. **Ready** (`spareReadyLabel`) is
a spare in a rotating category (`ComponentCategorySetting#rotates`) whose
`latest_service` is after `last_bike.removed_at`, or that was never installed, and
isn't due. It reads "<Service> · ready".

## Last bike and the Components list's Bike column

- **`ComponentAssignment.last_ended_by_component(user, at: Time.current, component_ids: nil)`**
  → `{ component_id => { bike_id:, bike_name:, ended_at: } }`: each component's
  most recently ended assignment (ended at or before `at`, ties on the higher id),
  in one `DISTINCT ON (component_id)` query. It's the one definition of "which bike
  was this last on", shared by `GET /components`, `GET /components/:id` and
  `Bikes::ServiceableComponents.off_bike_components_by_bike`.
- **`last_bike: {id, name, removed_at} | null`** on `GET /components` and
  `GET /components/:id` — set only when `current_bikes` is empty, retired components
  included; `null` when mounted or never installed.
- **Bike column** on the Components list (`ComponentBikeCell`; "Components page" in
  `docs/frontend-ui.md`): installed shows the bike, linked, and "since <date>" (a
  shared cassette reads "Juan Solo +1" with "Trainer only, shared"). A spare shows
  "Spare" in blue, then "Last on <bike>" or "Never installed". Retired shows
  "Retired <date>", then the last bike. Sort (`bikeSortKey`): installed by bike name,
  spares by last bike, never installed, then retired.
- **Component page**: the header line reads "Spare · last on <bike>" (or "Last on
  <bike>" once retired) whenever there's a `last_bike`.

## Deleting a component

Only a component with **no history** can be deleted: no assignment, ever (current
or ended), and no maintenance event (`Component#deletable?`).

- **The server** (`ComponentsController#destroy`) returns 422 with `{ base: ["This
  component has installation or maintenance history, so it can't be deleted. Retire
  it instead."] }` otherwise, and changes nothing. A deletable component still takes
  its service requirements with it.
- **`GET /components/:id`** returns `deletable`.
- **The component page's ⋯ menu** enables Delete only when that's true. Otherwise it
  shows "Has history. Retire it instead." It confirms, then returns to
  `/components`.
- **Elsewhere:** the Components list has no Delete.

Anything that has been on a bike or serviced is retired instead ("Retiring a
component" below), so its mileage and history are never lost.

## Retiring a component

Retiring is one action that also takes the part off the bike, so a retired component
can't keep reading as mounted or accruing mileage.

- **`POST /components/:id/retire`** `{ at, replacement_component_id?, tz }` →
  `200 { component, ended_assignments, new_assignment }`. `new_assignment` is null
  without a replacement. Errors are `422 { base: [...] }`, the same shape swap uses. Another
  user's component or replacement 404s. `at` defaults to now, and `tz` is resolved like
  `/dashboard`'s (`ActiveSupport::TimeZone[tz] || Time.zone`).
- **`Components::Retire`**, in one transaction:
  - With a replacement, it calls `ComponentAssignments::Swap` unchanged on the one
    active assignment. Swap then enforces same-category, not-retired, not-itself and the
    overlap rules, and copies the slot's `ride_context`.
  - Otherwise it ends **every** active assignment at `at`. That covers the
    `allows_multiple_assignments` indoor cassette shared across two bikes.
  - Then it sets `retired_on = at.in_time_zone(zone).to_date`.
  - Swap's own `transaction` nests inside Retire's without `requires_new`, so its
    `ActiveRecord::Rollback` only unwinds to the outer block. Retire therefore raises
    Rollback itself on any failure, and no half-done swap commits.
- **Validations**, which use the same timing rules as swap:
  - the component is already retired;
  - `at` is blank, or more than `Swap::FUTURE_TOLERANCE` ahead;
  - `at` is not strictly after an active assignment's start;
  - for an unmounted component, `at` is before its last removal;
  - a replacement was given for an unmounted component, or for one on more than one
    bike. In that case, retire it alone and then install the new part on each bike.
- **Date vs datetime:** `ended_at` keeps the exact instant, and attribution reads it,
  since windows are half-open. So rides after `at` count toward the replacement.
  `retired_on` is only the viewer's local calendar day.
- **UI:** `RetireComponentModal` is an `AppModal` with three parts:
  - **When**, using the swap modal's `DateTimePicker`;
  - "Currently on X. It will be removed from the bike at this time.";
  - an optional **Replace with**, shown only when the component is on exactly one bike.

  The button reads "Retire" or "Retire and replace". **Replace with** offers exactly
  the pill's options (`useSwapOptions`) for the component's one slot, since it's the
  same swap.
- **Entry points:**
  - ComponentDetail's header ("Retire");
  - the Components list's Retire pill, on each non-retired row (desktop and phone).

  The bike page's rows no longer offer it.

  `useRetireComponent` invalidates `setup`, `serviceStatus` and `history`. Those are
  swap's groups, and `serviceStatus` covers the components list and the dashboard.
- **The edit form has no "Retired on" field.** ComponentDetail shows **Un-retire** for
  a retired component, which sends `PATCH retired_on: null`. Its confirmation says the
  component won't be put back on a bike.
- **No feed event.** Retire with a replacement reads in the Activity log as the usual
  "Installed X on Bike, replacing Y". Retire alone reads as a removal.
- **`rails components:audit_retired_mounted`** (`Components::RetiredMountedAudit`) is
  read-only. It lists assignments whose component has `retired_on` set and that are
  still open, or that end after the end of `retired_on`'s day. It prints user ids,
  never emails. The day boundary uses the app's `Time.zone`, because a rake task has no
  viewer zone. An entry within a few hours of midnight can flag differently from the
  user's own zone, so each row prints its raw timestamps.

## Bike setup

Replaces manually repeating "track a slot → create a component → install it" once
per part (~8 times for a typical bike) with one batched step, optionally pre-checked
from a user-editable **bike type** preset.

- `BikeType`: user_id, name (unique per `(user_id, lower(name))`, same convention as
  `ServiceType`), default_categories (string array, default `[]`). Modeled on
  `ServiceType`, but `has_many :bikes, dependent: :nullify` instead of
  `restrict_with_error` — nothing is *calculated* from a bike type (it only
  pre-checks the setup checklist), so blocking a delete would just be friction.
  `default_categories=` strips blanks and dedupes, same free-text-no-server-list
  convention as `Component#category` — allowed values come from the frontend
  (baseline categories plus the user's custom ones), never validated against a
  fixed list here. `Users::Provision` seeds Road/Gravel/Mountain/Time Trial/
  Commuter with sensible defaults (Mountain is the one that includes
  front_suspension/rear_suspension/seat_post); a migration backfills the same for existing
  users, same find-or-create-never-overwrite convention as the category backfills
  above. **Editing a type's `default_categories`, or changing which type a bike
  uses, never adds, removes, or touches any slot/component/assignment on any
  existing bike** — there's no `after_save` hook on `Bike#bike_type_id` at all, so
  this is true by construction, not by a check that could drift out of sync.
- `BikeFormModal` gets a clearable "Type" `Select`; `BikeTypesPage.tsx` (a Settings
  tab next to Service Types) is where types are added/renamed/deleted and their
  `default_categories` edited via a `MultiSelect` built from `useAllCategories()`.
  The Bikes list's optional "Type" column resolves the name client-side against the
  already-fetched bike-types list (the `Bike` JSON only carries `bike_type_id`, a
  plain column) — same "resolve an id against an already-fetched list" pattern
  `MappedGearRow` uses for bike names on the Strava page.
- **`POST /bikes/:id/component_setup`** (`{ installed_on, components: [{ category,
  ride_context, label, brand, model, notes }, ...] }`) creates a `BikeComponentSlot`
  + `Component` + `ComponentAssignment` per row, all in one transaction — any row
  failing validation rolls back everything and responds `422` with `{ row_errors:
  { "<index>": {...errors} } }`, keyed by the row's position in the submitted array
  (not by category), so the form can show each failure inline. Every existing model
  validation applies completely unchanged — a row for a category the bike already
  has a slot for fails honestly on `BikeComponentSlot`'s own uniqueness validation
  rather than being silently skipped or reused, and a split `ride_context` for a
  category that doesn't `allows_multiple_assignments` fails on
  `ride_context_requires_allows_multiple_assignments`, not a check duplicated in the
  controller. Each row's own `ride_context` drives *both* the new slot's and the new
  assignment's `ride_context` (not forced to `"both"`) — this is what lets a category
  that `allows_multiple_assignments` be set up as two rows at once (one
  `outdoor_only`, one `indoor_only`) in the same batch, rather than requiring the
  indoor/outdoor split to be a manual follow-up action on the Bike detail page.
  `installed_on`/a row's `acquired_on` need no date→timestamp conversion — assigning
  a bare date string straight into a timestamp column already casts to midnight UTC
  via Rails' normal attribute typecasting, the same assumption every requirement's
  synthetic-fallback baseline date relies on when it falls back to `acquired_on` (see
  "Service intervals and maintenance alerts" below), so this reuses that convention
  rather than inventing a new one.
- **`/bikes/:id/setup`** (`BikeSetup.tsx`, pieces in `components/bikeSetup/`, pure
  helpers in `bikeSetupModel.ts`) is a page, not a step inside `BikeFormModal` — the
  checklist can run to 18 rows. Top to bottom:
  - **Back link and header** (`BikeSetupHeader`): "‹ {bike}" to `/bikes/:id`;
    "Set up components" with the bike type's chip; a dimmed "{bike} · Fill in a part to
    track it, or tick it to track it without details." (plus "The {type} preset ticks
    its usual parts." with a type); Skip for now and Set up N components on the right
    (from `sm` up; `setupButtonLabel`, disabled at 0).
  - **Toolbar card** (`BikeSetupToolbar`): "Installed since" — one shared pill
    `DateInput` (default `bike.acquired_on`, else today) for every checked row, with its
    hint that rides before that date won't count (existing attribution behavior, see
    "Core logic") — then "8 of 14 ticked" (`tickedCount`: checked rows of every row that
    can be tracked) and Check all / Clear all. It wraps, and stacks on a phone.
  - **The checklist** (`SetupChecklistList`, a `DataList`): checkbox | Category | Label |
    Brand | Model | Notes. Rows are plain `DataListRow`s (no `onOpen` — they're full of
    inputs), memoized (`SetupRowItem`). One row per `trackable` category from
    `useAllCategories()` not already fully slotted; a fully tracked category (every
    valid `ride_context` already has a slot) is a muted "Already tracked" row
    (`AlreadyTrackedRow`) with the installed part's label, from the same `GET
    /bikes/:id` payload's open `component_assignments` (`trackedLabel`). A fresh
    `allows_multiple_assignments` category's sole starting row has an editable
    ride-context `Select`; picking `outdoor_only`/`indoor_only` there reveals "+ Add
    outdoor/indoor too", which appends the complementary row (context fixed, shown as a
    chip, with "Remove"), since `"both"` and a split pairing can't coexist. A category
    with one context already slotted offers only the missing one, with a dimmed line
    saying what's tracked. Brand and Model are separate cells
    (`ComponentBrandModelInputs layout="cells"`); inputs carry `aria-label`s ("Chain
    label") instead of visible labels.
  - **Sticky action bar** (`BikeSetupActionBar`, `actionBarSummary`): "8 components
    will be created and installed on {bike}" over "From Apr 4, 2026 · 5 with details ·
    3 ticked without details · 1 row needs a fix" (zero parts left out; "with details" is
    any of Label, Brand, Model or Notes filled in), or "Nothing to set up yet", with the
    same two buttons. `position: sticky` at `bottom: var(--app-shell-footer-offset)`, so
    on a phone it sits above the tab bar and the home-indicator inset, and as an in-flow
    element it never hides the last row. A phone shows "8 will be installed from …"
    over Skip and a full-width primary, and the header's buttons hide.
  - **Phone:** the same list, `stacked` — each row a card section: the checkbox and
    category name as one label (tapping the name toggles), the chip, then Label full
    width, Brand and Model side by side, then Notes; `md` inputs and 44px targets.
  - **Entered values decide what's tracked.** Label starts blank on every row (the
    complementary split row too); left empty, it saves a fallback the input shows live
    as its italic placeholder: `"{brand} {model}"` (whichever exist), else `"{bike name}
    {category label}"`, plus `" (Outdoor only)"`/`" (Trainer only)"`
    (`RIDE_CONTEXT_LABELS`) on a split row. A typed label is sent as typed, trimmed.
    `setupRowLabel` (`utils/setupRowLabel.ts`) feeds both placeholder and submit.
    Frontend only: the endpoint still requires a label and always gets one. Typing in
    an unchecked row's Label, Brand, Model or Notes checks it (picking a suggestion
    counts; the check is merged into the same change); clicking or tabbing into an
    input just focuses it, and "+ Notes" just opens the notes. A row checked by typing
    is `autoChecked`, and unchecks itself when focus leaves one of those four inputs
    and all four are empty (trimmed) — on blur, not every change, so
    select-all-and-retype doesn't flicker. The checkbox, Check all / Clear all and the
    bike type preset are deliberate checks (`autoChecked: false`): they're how to track
    a part without details, and those rows stay checked when emptied. Brand/Model's
    on-blur casing fix reports itself as `'blur'`, so it never checks a row
    (`utils/setupRowActivation.ts`). Unchecking keeps whatever was typed; submit sends
    every checked row, empty or not.
  - **"Ticked by {type} preset":** a dimmed line under the category of a row the bike
    type's preset checked (`presetChecked`, set by `buildInitialRows`). Display only;
    it clears when the user unchecks the row, uses Check all / Clear all
    (`deliberateCheck`) or types into it (`typedChange`).
  - **Row states:** an unchecked row dims its category name and input cells (opacity
    only, so checking or unchecking never changes a row's height); a row error (the
    `422`'s `row_errors`, mapped back from the submitted index) is a red-toned row with
    the message on its Label input, counted in the action bar; non-row errors show in an
    alert above the checklist. Notes is a pill — "+ Notes", "1 note" (typed but hidden),
    "Hide notes" — and an open note sits on its own line from the Label column to the
    end. "Skip for now" navigates to `/bikes/:id` with no request sent.
- `BikeFormModal` has an `onCreateSuccess?: (bike: Bike) => void` prop (same
  pattern as `ComponentFormModal`'s own, fired only on a successful *create*, never
  edit). Only the Bikes page's main "+ New Bike" button passes
  `onCreateSuccess={(bike) => navigate(\`/bikes/${bike.id}/setup\`)}` — the Strava
  page's two other bike-creation shortcuts ("+ Create new bike" in gear mapping,
  "Track as retired bike") don't pass it, so they keep their existing behavior
  unchanged. `BikeDetail.tsx` also links to the setup page wherever it already shows
  "No component types tracked yet.", for anyone who skipped and wants to come back.

## Brand/model autocomplete

`Component#brand`/`#model` stay free text (a user can always type a value that
isn't suggested) — Mantine `Autocomplete`, never `Select`. Every surface that
creates or edits a component's brand/model goes through one shared component,
`frontend/src/components/ComponentBrandModelInputs.tsx`, so the rules below live in
exactly one place: `ComponentFormModal.tsx` (create/edit, `layout="stacked"`) and
Bike setup's Brand and Model columns (`layout="cells"`: the two fields alone, for
two grid cells, `aria-label`led with no visible labels).

- **Sources**: the user's own components, via the existing `useComponents()` query
  (no new endpoint — it already returns every component including retired ones
  with `brand`/`model`/`category`, and every component mutation already
  invalidates `['components']`, so suggestions stay current for free); plus
  `ComponentCategorySetting#common_brands` for whichever category is currently
  selected — per-category and user-editable (see the data model above), not a
  hardcoded frontend constant, so a chain never suggests a tire brand and vice
  versa. `common_brands` isn't just the seeded/edited list — saving a component
  with a brand not already there appends it (see the data model above), so
  "Common brands" also grows from the user's own history even after the
  originating component is deleted; add-only, and a brand removed on the Settings
  page comes back if a component using it is saved again. No built-in model list —
  models only ever come from the user's own data.
  `frontend/src/hooks/useComponentSuggestions.ts` wraps the `useComponents()` query
  into `{ brands, models }` (distinct, case-insensitively grouped, with counts),
  (`buildSuggestionPool`), and takes an optional `extra` array to merge in
  not-yet-saved values. **The setup page builds one pool for the whole page**:
  `SetupChecklist` calls the hook once with every row's unsaved
  brand/model/category and passes the result to each row's inputs as
  `suggestions` (`ComponentFormModal` omits it and uses the hook directly).
  So typing "SRAM" in one row suggests it in another before either saves. The
  unsaved list is keyed on brand/model/category only (a label, note or
  checkbox change leaves the pool alone) and goes through `useDeferredValue`,
  so a keystroke updates its own row first and the other rows' suggestions
  catch up in a background render; `SetupTableRow` is `React.memo` with stable
  `(category, key, …)` callbacks, so a keystroke re-renders only its row
  (measured: all 18 rows took ~46 ms dev / 21 ms prod per keystroke before,
  one row ~2.6 / 1.5 ms). Don't debounce the controlled inputs themselves.
- **Ranking** (`frontend/src/utils/componentSuggestions.ts`, plain functions, tested in `componentSuggestions.test.ts`): brand suggestions group into
  "Your brands" (usage count descending, then alphabetical) and "Common brands"
  (the current category's `common_brands` minus anything already in the first
  group, case-insensitively, alphabetical — empty, and the group simply omitted,
  when no category is known yet or the category has no seeded/added brands).
  Model suggestions filter to the brand currently typed (any category), or to the
  current category if brand is empty; within that, a category match ranks first,
  then usage count. Picking a model suggestion fills in its brand too, but only
  when the brand field is still empty. Mantine's own default `Autocomplete`
  filtering already does case-insensitive "anywhere in the string" matching and
  (via `limit={10}`) caps the dropdown, across grouped data — no custom filter
  function needed for that part.
- **Casing**: on blur, the typed value is trimmed and, if it matches a suggestion
  case-insensitively, replaced with that suggestion's exact casing
  (`resolveCasing`; `onChange` fires only when that changes the value) — models compare only against models of the matching brand.
  This is deliberately a frontend-only nudge, not a server-side rule — `Component`'s
  `normalizes` (see the data model above) only squishes whitespace, it never
  touches case, so two differently-cased spellings of the same brand can still
  exist in the database; this feature's whole point is to stop *new* entries from
  adding to that drift, not to repair old ones (no backfill, by design, same as the
  `normalizes` change itself).

