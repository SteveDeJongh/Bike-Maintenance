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
- **`SwapComponentModal`** (`frontend/src/components/forms/SwapComponentModal.tsx`)
  is the one shared modal behind every "Swap…" entry point — a `Select` of
  eligible same-category components (not retired, not the current one; each
  option's caption shows total distance and its worst-status requirement's own
  remaining/overdue text, via `useComponentsDetails` — a small `useQueries`-based
  hook fetching each eligible candidate's own `GET /components/:id`, same
  "fine for a handful, not for a many-row list" scale `Component#total_distance`'s
  own note already describes) plus a `DateTimePicker` defaulting to now, through
  `AppModal`. When exactly one other eligible component exists — the common
  case, the other chain — it's preselected, so swapping is one tap to open plus
  one tap on "Swap" to confirm. Entry points: the bike page's installed-components
  table (`components/bike/SlotRow.tsx`, a plain "Swap…" button next to "Remove")
  and its mobile cards (`InstalledComponentsCardList`'s `FilledSlotCard`, inside
  the "⋯" menu); `ComponentDetail.tsx`, one "Swap…" button per bike the component
  is currently mounted on (plural in the rare indoor_only-shared-across-bikes
  case); and the dashboard's `BikeCard`, where tapping a `MountedRow` itself opens
  the modal directly — the one-tap-plus-confirm phone shortcut the feature's own
  rationale calls for. "Remove" and "Install" are both untouched everywhere —
  swap is an addition, not a replacement. On success, invalidates `setup`,
  `serviceStatus` (which already covers `dashboard`), and `history` — the same
  groups `useCreateComponentAssignment`/`useDeleteComponentAssignment` already use.
  `ComponentCurrentBike`/`DashboardMountedComponent` both carry an `assignment_id`
  field (the swap action's own target) — `ComponentCurrentBike`'s is optional, since
  only `GET /components/:id` (not the Components list's own `current_bikes`) sets it.

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
- **`/bikes/:id/setup`** (`BikeSetup.tsx`) is a page, not a step inside
  `BikeFormModal` — the checklist can run to 18 rows. One row per `trackable`
  category from `useAllCategories()` not already fully slotted; a category already
  tracked (every valid `ride_context` for it already has a slot) shows as a
  disabled "Already tracked" row instead of being hidden. A fresh
  `allows_multiple_assignments` category's sole starting row has an editable
  ride-context `Select`; picking `outdoor_only`/`indoor_only` there reveals a
  "+ Add outdoor/indoor too" action that appends the complementary row (context
  fixed, not re-selectable, since `"both"` and a split pairing can't coexist). A
  category with one context already slotted (e.g. `outdoor_only` tracked
  elsewhere) offers only the missing one, pre-labeled with what's already tracked.
  Checked-row fields (label pre-filled `"{bike name} {category label}"`,
  brand/model, notes collapsed by default behind a toggle) and un-checked rows
  render the exact same row height — every input is always rendered, just
  `disabled` when unchecked, instead of appearing/disappearing, so toggling a
  checkbox never reflows the table. One shared "Installed since" `DateInput`
  (default `bike.acquired_on`, else today) applies to every checked row; its helper
  text calls out that Strava rides before that date won't count toward these
  components (existing attribution behavior, not new logic — see "Core logic"
  above). "Check all"/"Clear all" and "Skip for now" (navigates to `/bikes/:id`
  with no request sent, leaving the bike exactly as-is) round it out.
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
`BikeSetup.tsx`'s per-row "Brand / Model" column (`layout="inline"`, one merged
table cell per row, not two).

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
  and takes an optional `extra` array to merge in not-yet-saved values — `BikeSetup`
  passes every other checklist row's current brand/model/category (memoized over
  its row state), so typing "SRAM" in one row suggests it in another before either
  saves.
- **Ranking** (`frontend/src/utils/componentSuggestions.ts`, plain functions — not unit-tested yet; per the Vitest convention in CLAUDE.md they should get tests next time they change): brand suggestions group into
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
  (`resolveCasing`) — models compare only against models of the matching brand.
  This is deliberately a frontend-only nudge, not a server-side rule — `Component`'s
  `normalizes` (see the data model above) only squishes whitespace, it never
  touches case, so two differently-cased spellings of the same brand can still
  exist in the database; this feature's whole point is to stop *new* entries from
  adding to that drift, not to repair old ones (no backfill, by design, same as the
  `normalizes` change itself).

