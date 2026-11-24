# Data model and core attribution logic

> Reference material split out of CLAUDE.md. A quoted cross-reference such as "see \"Strava integration\"" names a `##` section heading; CLAUDE.md's "Further docs" list says which docs/ file holds each heading.

## Data model

- `User`: name (required), email (nullable — Google asserts one but Strava never does;
  unique case-insensitively via a partial index on `lower(email)` where not null, backed
  by `normalizes :email`), email_verified_at (nullable datetime), password_digest
  (nullable — `has_secure_password(validations: false)`; a Google/Strava-only user has
  none). `after_create` calls `Users::Provision` (see below) regardless of how the user
  was created — registration, OmniAuth, `users:claim`, console, seeds. See "Authentication" for the full picture.
- `UserIdentity`: user_id, provider (`"google"`/`"strava"`/later `"apple"`), uid (the
  provider's stable subject id — Google's `sub`, Strava's athlete id as a string), email
  (as the provider asserted it, nullable), email_verified (boolean), last_used_at.
  Unique per `(provider, uid)` and per `(user_id, provider)` — one Google identity per
  user is enough. Email+password is not a row here; it lives on `User` directly.
- `TableViewPreference`: user_id, table_key (string, e.g. `"bikes"`), data (jsonb,
  default `{}`) — unique per `(user_id, table_key)`. The generic backing store for any
  sortable/configurable-column table in the app (see "Sortable, configurable tables"
  below), not Bikes-specific — a second list page gets its own `table_key`, reusing the
  same model/endpoint. `data` holds `{ columns: [...], sort_column, sort_direction }`;
  validated as "must be a Hash", plus one per-table-key rule
  (`TableViewPreference::GROUP_BY_VALUES`): `group_by`, when present, must be `week`
  or `none` for `activity_log` and `category`, `bike` or `none` for `components`.
  Other keys don't group, so it isn't checked there. Otherwise, like `Component#category`, the actual allowed
  column keys live only on each page's own frontend constant (e.g. `constants.ts`'s
  `BIKE_LIST_COLUMNS`), not enforced server-side. Exposed via `GET/PATCH
  /table_view_preferences/:table_key` — `update` upserts (a user may not have a row for
  that key yet), and a `PATCH` always replaces the whole `data` value (no deep merge),
  so the frontend must send the complete object on every change, not just the changed
  field.
- `Bike`: user_id, name, make, model, strava_gear_id, acquired_on (date, nullable —
  purchase date; validated `<=` `retired_on` when both present), retired_on,
  bike_type_id (nullable FK to `BikeType`, validated same-user — see "Bike setup"
  below). `acquired_on` is also the default "Installed since" date in the batched
  component setup step.
- `Component`: user_id, label (e.g. "Chain A"), category (chain, cassette, tire_front,
  tire_rear, ...), acquired_on, retired_on, brand (string, nullable), model (string,
  nullable), notes (text, nullable) — category doubles as a "slot" for validation.
  `retired_on` is set by the Retire action (`POST /components/:id/retire`, see
  "Retiring a component" in `docs/components-and-setup.md`) as the **local date** of
  the removal; the exact instant lives on the ended assignment's `ended_at`. The edit
  form no longer sets it, and Un-retire clears it without re-mounting anything.
  `brand`/`model` are `normalizes`d (`v.squish.presence`, same convention as
  `User#normalizes :email`) — whitespace-collapsed, blank becomes `nil`, casing left
  alone (see "Brand/model autocomplete" below for where casing gets handled instead).
  No backfill — an existing row only normalizes the next time it's saved.
- `BikeComponentSlot`: bike_id, category, ride_context (string: `"both"`/`"outdoor_only"`/
  `"indoor_only"`, same enum/validation as `ComponentAssignment#ride_context`, DB default
  `"both"`) — unique per `(bike_id, category, ride_context)`. What "+ Track a new
  component type" on the Bike detail page creates; each row is independently
  created/removed. A category normally has at most one slot (`"both"`) per bike, but a
  category with `ComponentCategorySetting#allows_multiple_assignments` can have up to
  two, one `outdoor_only` and one `indoor_only` — real, separate rows a user tracks and
  stops tracking on their own (e.g. a dedicated outdoor cassette slot and a separate
  indoor/trainer cassette slot on the same bike), not a computed pairing. A non-`"both"`
  `ride_context` is only valid when the category actually allows it. `before_destroy`
  blocks removing a slot that still has a matching active assignment — for a `"both"`
  slot, any active assignment of that category; for a split slot, only one whose own
  `ride_context` matches, so stopping tracking one variant is never blocked by the
  other's still-active assignment.
- `ComponentAssignment`: component_id, bike_id, started_at, ended_at (nullable = currently
  mounted), ride_context (string: `"both"`/`"outdoor_only"`/`"indoor_only"`, default
  `"both"`, backend-validated — unlike `category`, this one directly drives computation,
  so it's a real enum, not a free-text frontend-owned concept). No overlapping
  assignments for the same component, and no overlapping assignments for the same
  (bike, category) slot, with two exceptions, both gated behind that category's
  `ComponentCategorySetting#allows_multiple_assignments` being `true` (a category with no
  such setting, or an explicit `false`, stays strictly single-install-only):
  - same bike, same category: an `outdoor_only` + `indoor_only` pair, one per
    independent `BikeComponentSlot` (e.g. a dedicated trainer cassette installed
    alongside a dedicated road cassette on the same bike at the same time).
  - same component, different bikes: two concurrent `indoor_only` assignments (e.g. a
    cassette that physically lives on the trainer, not on any one bike's frame — "which
    bike" is just an attribution label for a ride, not a claim about where the part is
    mounted, so the same component can be "installed" on whichever bike is currently
    clipped into the trainer). Both sides must be `indoor_only` here — unlike the
    same-slot case, there's no one-each-context pairing across bikes.
  Timestamps, not dates: a component can be swapped more than once in a day.
  Validates that `component.user_id == bike.user_id` (no cross-user assignments).
  Reachable from a `User` via `has_many through:` on `bikes` — no direct `user_id`
  column of its own. `#overlaps?` (the private helper both overlap validations above
  share) is **half-open** (`[started_at, ended_at)`), matching attribution's own
  windowing (`#activities_from`, `Component#total_distance`) — a range that starts
  exactly where another ends does not overlap, same as a ride on that exact instant
  is already credited to exactly one of the two, never both. This is what makes the
  one-step swap (`ComponentAssignments::Swap`, see "One-step component swap" below)
  a valid assignment pair at all: its two assignments always share an exact boundary.

- `ComponentCategorySetting`: user_id, category, default_ride_context (string, same
  3-value enum/validation as `ComponentAssignment#ride_context`, DB default `"both"`),
  trackable (boolean, DB default `true`), allows_multiple_assignments (boolean, DB
  default `false`), rotates (boolean, DB default `false`) — unique per `(user_id, category)`. User-serviceable (`GET
  /component_category_settings` returns every category's settings at once; `PATCH
  /component_category_settings/:category` upserts one, same upsert-by-key
  convention as `TableViewPreference`'s own `PATCH`), surfaced on the Settings
  page's "Component Categories" section:
  - `default_ride_context` is a default-suggestion only — which `ride_context` to
    pre-select when installing a new component of that category. It does *not*
    restrict what any individual assignment's `ride_context` can actually be set to,
    which is what makes the indoor/outdoor-cassette scenario above possible (the
    category default can say `outdoor_only` while one specific assignment is still
    manually set to `indoor_only`).
  - `trackable` gates every "start something new in this category" flow (the Bike
    detail "+ Track a new component type" dropdown, the standalone Components page's
    "+ New Component" category picker) — purely a frontend creation-time filter, never
    retroactive against already-tracked slots or already-created components.
  - `allows_multiple_assignments` is the one setting with real backend teeth — it's
    what lets a category's `BikeComponentSlot` be split into independent
    `outdoor_only`/`indoor_only` slots at all, and what `ComponentAssignment`'s overlap
    validation reads to decide whether an outdoor_only+indoor_only pair (one slot each),
    or the same component shared indoor_only across bikes, is permitted for that
    category (see above). One setting deliberately backs both cases rather than two
    separate columns — they're the same underlying idea for a category ("not strictly
    one-active-installation-at-a-time"), and splitting them isn't justified until a real
    need for independent control over each surfaces.
  - `rotates` (boolean, DB default `false`) — whether the category's components rotate
    on a bike (two waxed chains swapped back and forth). Display-only: it gates the
    Home page's rotation strip and which components `Dashboard::Summary` computes
    lifetime distance for (`docs/dashboard.md`). `AddRotatesToComponentCategorySettings`
    backfilled `true` for every existing chain row; `Users::Provision::ROTATES_CATEGORIES`
    (`%w[chain]`) does the same for new users. Custom categories default to `false`.
  A missing row behaves as each column's own DB default (`"both"`/`true`/`false`).
  Every user gets a fully editable starting point for each of the 18 known categories
  — picker order is drivetrain → wheels/tires → brakes → contact points → frame/
  suspension → power meter: `chain`/`cassette`/`chainring`/`bottom_bracket`,
  `wheel_front`/`wheel_rear`/`tire_front`/`tire_rear`, `brake_pads_front`/
  `brake_pads_rear`, `saddle`/`handlebar_tape`/`pedals`, `frame`/`front_suspension`/
  `rear_suspension`/`seat_post`, `power_meter`. `default_ride_context` is
  `"outdoor_only"` for tire_front/tire_rear/wheel_front/wheel_rear/
  brake_pads_front/brake_pads_rear/front_suspension/rear_suspension, `"both"` for
  everything else, including `cassette` (a fresh cassette defaults to accruing
  mileage from every ride; a user running separate road/trainer cassettes sets up
  the outdoor_only/indoor_only split explicitly — see "Bike setup" below); only
  `cassette` seeds `allows_multiple_assignments: true` — deliberately *not*
  hardcoded logic, every row is changeable via the Settings page.
  `handlebar_tape`'s label is `"Handlebar Tape/Grips"` (key unchanged — renaming it
  would mean a data migration across components/slots/settings/requirements for no
  gain). For users existing before a given category was added, a migration backfills
  it (`find_or_create_by`-equivalent `ON CONFLICT DO NOTHING`, never overwriting an
  edited row); for every user since, it's `Users::Provision` (see "Authentication"
  below), which replicates the exact same values on `User#after_create`. Fully
  user-definable categories were raised during design but are an explicitly deferred
  future idea, not built — categories stay free-text exactly as they are today (a
  custom category with the same key as a later-added built-in, e.g. a pre-existing
  `front_suspension`, just becomes that built-in; the migration's `ON CONFLICT DO
  NOTHING` leaves it and its settings untouched — a genuine near-duplicate under a
  different key is never auto-merged automatically).
  Also carries two nullable notification overrides, `notifications_enabled` and
  `warning_threshold_percent` — `nil` means "inherit the global `NotificationSetting`"
  (see below), the same missing-value-means-inherit convention this model's other
  columns already use relative to their own DB defaults. `common_brands` (string
  array, DB default `[]`) is the "Common brands" suggestions in the component brand
  autocomplete — seeded per category the same way as the columns above (a migration
  for existing users, `Users::Provision` for new ones), fully editable via the same
  Settings page; `frame` and any custom category just keep the `[]` default, since
  there's nothing sensible to guess. Deduped case-insensitively, keeping the first
  spelling seen (`Array#uniq` with a block already does this). Four front/rear
  pairs — `tire_front`/`tire_rear`, `wheel_front`/`wheel_rear`,
  `brake_pads_front`/`brake_pads_rear`, `front_suspension`/`rear_suspension`
  (`ComponentCategorySetting::BRAND_LIST_PAIRS`, exposed to the frontend as each
  setting's own `brand_list_partner`, though the frontend only uses it to mirror an
  in-progress edit onto the partner row, not to show it) — always share one
  `common_brands` list: a write to either side is mirrored onto the other, in the
  same transaction, by `ComponentCategorySettings::UpdateCommonBrands`. A category
  merely *seeded* from the same brand group (e.g. `chain`/`cassette`) is not paired
  this way — that was only ever a shared starting point. Saving
  a `Component` with a brand not already in its category's list
  (case-insensitively) appends it there via `ComponentCategorySettings::AddCommonBrand`
  (`Component#remember_brand`, an `after_save`) — add-only: deleting/retiring a
  component, or clearing its brand, never removes anything, and a brand removed on
  the Settings page is re-added if a component using it is saved again. See "Brand/
  model autocomplete" below.
- `ServiceType`: user_id, name — unique per `(user_id, lower(name))`. A user-defined
  kind of maintenance (wax, sealant top-up, brake bleed, ...) — per this file's own
  rule, something that drives real computation (service requirements) gets a real
  model, not free text like `category`. Renaming is safe everywhere (every
  reference is by id); deleting a type still in use by any `MaintenanceEvent` or
  `ServiceRequirementSatisfier` is blocked (`restrict_with_error`). Managed on the
  Settings page (`ServiceTypeEditModal`), and every service-type picker in the app
  can also create one inline. `Users::Provision` seeds `wax`/`clean`/`replace`/
  `inspect` for every new user, untagged.
  **Category tags** (`ServiceTypeCategory` below): `#categories` (sorted strings),
  `.applicable_to(category)` (tagged for it, or untagged), `#applicable_to?`,
  `#replace_categories!(list)` (set-replace in one transaction, stripping blanks and
  dupes; `[]` = universal), and `#tag_for!(category)` — the automatic-tagging
  primitive, which only adds a tag when the type is tagged but **not** for this
  category: an untagged type already applies everywhere, and tagging it would
  narrow it. Nothing ever removes a tag automatically. `GET /service_types` returns
  `categories`, `requirement_count` (satisfier rows — unique per owner+type, so
  distinct templates + custom requirements; linked rows inherit and aren't
  counted) and `event_count`, from three batched queries total;
  `POST`/`PATCH` accept `categories: [...]` (on `PATCH`, an omitted key leaves the
  tags alone). Inline creates from a picker that knows its category send
  `categories: [category]`.
- `ServiceTypeCategory`: service_type_id (FK, `ON DELETE CASCADE`, plus
  `dependent: :delete_all`), category — unique per `(service_type_id, category)`.
  `category` follows `Component#category`'s own rules exactly: free text,
  presence-only, no normalisation. **Filter, don't forbid**: tags only decide what
  a picker suggests first — nothing validates an event, requirement, or satisfier
  against them, so existing records stay valid whatever their type's tags.
  Categories can't be renamed today; a future rename must update these rows in
  the same transaction as `component_category_settings`. Auto-tagged by
  `ServiceRequirementSatisfier`'s `after_save` (when `service_type_id` changed —
  every satisfier path: nested create/update, and templates/custom requirements
  created with satisfiers inline), using the owner template's category or a custom
  row's component's category. Backfilled by
  `20261120200001_backfill_service_type_categories` (satisfier categories first,
  falling back to the categories of components the type has events on;
  inspect/clean/replace, case-insensitively, stay universal). Belongs to its owning
  user *directly* (`MaintenanceEvent` and `ServiceRequirementSatisfier` both
  validate that any `service_type_id` they reference shares their own owner — see
  "Authentication" below for why this needed a fix).
- `MaintenanceEvent`: component_id, service_type_id, performed_at (timestamp), notes,
  service_session_id (nullable FK — see "Batch service logging" below). Reachable
  from a `User` via `has_many through:` on `components` — no direct `user_id` column
  of its own. Logging one is what moves a service requirement's due point forward
  (see "Service intervals and maintenance alerts" below) — nothing is stored as a
  counter; progress is always computed from event history. An event logged one at a time
  (`ComponentDetail`, the Dashboard's single-component "Log service") has
  `service_session_id: nil` — only
  `ServiceSessionsController#create`'s batch path ever sets it. Once set, the
  event's own `performed_at` can't be edited directly (`on: :update` validation,
  so creating it alongside the session is unaffected) — it always matches its
  session's date, which only moves by editing the session itself. Destroying an
  event whose session has no other events left destroys that session too
  (`after_destroy`), so a session is never left empty.
- `ServiceSession`: user_id, bike_id, performed_at (timestamp), notes (nullable).
  Groups `MaintenanceEvent`s logged together on one bike in one batch (see "Batch
  service logging" below) — `validates :bike_id`'s owner matches `user_id`.
  Changing its own `performed_at` cascades to every one of its events via
  `update_all` in the same request (bypassing their own validation deliberately,
  the one legitimate way an event's date moves after creation) — not a separate
  endpoint call per event. `FUTURE_TOLERANCE` (5 minutes, same order of magnitude
  as `StravaCredential::REFRESH_BUFFER`) is the only place a future `performed_at`
  is rejected in this app; plain single-event `MaintenanceEvent` logging has no
  such check and is unchanged. Deleting a session deletes its events
  (`dependent: :destroy`). Deliberately no "remove one event from its session" —
  delete the event (which, per the rule above, deletes an emptied session too)
  and re-log it instead; one less concept for the same result.
- `CategoryServiceRequirement`: user_id, category, name, distance_meters (nullable),
  moving_time_seconds (nullable), calendar_amount (nullable integer) + calendar_unit
  (nullable, `"day"`/`"month"`/`"year"` — a real unit, never converted to days, so
  due-date math is real calendar arithmetic via `Date#advance`, not a fixed 30/365-day
  assumption), ride_filter (`"all"`/`"outdoor"`/`"indoor"`, DB default `"all"`) —
  unique per `(user_id, category, lower(name))`, at least one of the three thresholds
  required. A suggested requirement template for a category (e.g. chain → "Chain
  lube" every 500 km), user-managed on the Component Categories settings page.
  What comes due is a named thing with its own thresholds, cleared by one or more service types (`ServiceRequirementSatisfier` below). `ride_filter`
  narrows (never widens) which rides count toward the distance/moving-time
  dimensions, on top of whatever a component's own `ride_context` already admits —
  calendar time keeps advancing regardless of `ride_filter`, since it isn't
  ride-derived at all (see "Service intervals and maintenance alerts" below for how
  this composes with `ride_context` in the batched query). Creating a component in a
  category auto-creates an enabled, linked `ComponentServiceRequirement` for each of
  that category's templates (`Component#after_create`) — a linked row has no
  satisfiers of its own, it inherits the template's; adding a template later does
  **not** retroactively attach to existing components — that's an explicit "apply to
  these components" action instead (`POST /category_service_requirements/:id/apply`).
  Deleting a template deletes its linked `ComponentServiceRequirement` rows and its
  own satisfiers; custom (unlinked) component rows are untouched.
- `ComponentServiceRequirement`: component_id, category_service_requirement_id
  (nullable — null means custom, not linked to a template), name (nullable — always
  `nil` on a linked row, required on a custom one), distance_meters/
  moving_time_seconds/calendar_amount/calendar_unit/ride_filter (all nullable — on a
  linked row these are per-component *overrides* of the template, `nil` meaning
  "inherit"; on a custom row they're its own real values, same at-least-one-threshold
  rule as a template), enabled (boolean, default `true`) — unique per `(component_id,
  category_service_requirement_id)` where linked, and per `(component_id,
  lower(name))` where custom (two independent partial unique indexes, not one
  constraint, since the two row kinds share no field to collide on). What actually
  applies to one component. `#effective` is the **one** method that resolves a
  linked row's live inheritance (name/thresholds/ride_filter/satisfiers, falling back
  to the template wherever this row's own column is `nil`) or, for a custom row,
  just reflects its own columns and satisfiers straight back — callers (status
  computation, every serializer) always go through this, never resolve inheritance
  themselves. A linked row's own `satisfiers` association is always empty;
  `#effective[:satisfiers]` is what actually resolves to the template's own,
  allowances included. Disabling (`enabled: false`) keeps the row, evaluated as if
  absent, and re-enablable in place; removing (destroy) is a real delete — the
  component loses that category default entirely, and nothing re-adds it
  automatically. The component page offers "+ Add from category defaults" (`POST
  /component_service_requirements/apply_defaults`) listing the category's templates
  not currently **linked** on this component (not by service type — a template can have more than one satisfier)
  — this is also how a previously-removed default gets added back, since there is no
  removal history: "never had it" and "had it and removed it" are treated
  identically, both simply available to add.
- `ServiceRequirementSatisfier`: owner (polymorphic — a `CategoryServiceRequirement`
  template, or an **unlinked** `ComponentServiceRequirement`; never a linked row,
  which has none of its own), service_type_id, position (integer — position 1 is the
  default service type for "Log service"/"Select all due and warning"),
  allowance_distance_meters/allowance_moving_time_seconds/allowance_calendar_amount+
  allowance_calendar_unit (all nullable — per-dimension overrides on how far *this*
  satisfier's own service buys; `nil` on a dimension means "same as the owning
  requirement's own effective threshold for that dimension," resolved by
  `ComponentServiceRequirement#effective_satisfiers`/the status algorithm below,
  never by the caller) — unique per `(owner, service_type_id)`; an allowance can only
  be set on a dimension the owner itself actually has a threshold on
  (`allowances_match_owner_thresholds`). What clears a requirement, and how far it
  buys: e.g. "Chain lube" (500 km) satisfied by a hot wax (no override — inherits
  500 km) or a drip wax (`allowance_distance_meters: 250_000` — a shorter-lived
  service). `before_destroy` blocks removing an owner's **last** satisfier directly
  (`ensure_not_last_satisfier`) — a requirement always needs at least one — but
  `has_many :satisfiers` on both owner models uses `dependent: :delete_all`, not
  `:destroy`, specifically so that guard never blocks a cascading destroy of the
  whole owner (template or custom row) along with its only satisfier.
- `NotificationSetting`: user_id (unique — one row per user), notifications_enabled
  (boolean, default `true`), warning_threshold_percent (integer, default `5`). Global
  per-user defaults for service alerts; a missing row behaves as the hardcoded
  true/5% default, same convention as `ComponentCategorySetting`. A category's own
  `notifications_enabled`/`warning_threshold_percent` override these when set;
  `NotificationSetting.effective_for(user:, category:)` is the one place that
  resolves category-override-then-global-then-hardcoded-default — callers never
  chase that fallback chain themselves.
- `ServiceAlertDismissal`: component_service_requirement_id, dismissed_at (timestamp),
  dismissed_status (`"warning"` or `"due"`). Recorded by `POST
  /service_alert_dismissals` (one requirement) or `POST
  /service_alert_dismissals/dismiss_all` (every currently banner-eligible alert, or
  just those of one status via an optional `status` param — backs each banner's own
  "dismiss all" without clearing the other banner's alerts too). A dismissal only
  suppresses its own status: it expires on the next completed sync after
  `dismissed_at` (see `StravaCredential#last_synced_at` below), and it stops
  suppressing immediately if the status has since escalated (a dismissed `warning`
  that becomes `due` shows again right away). Logging the service clears it
  implicitly, since the status just returns to `ok`.
- `StravaActivity`: user_id, strava_id (unique), bike_id (resolved from gear_id,
  nullable until mapped), gear_id (Strava's raw per-activity identifier, stored
  separately from bike_id so a bike mapped *after* activities were already synced can
  retroactively backfill them — see `StravaActivity.reconcile_for_bike!`),
  distance_meters, moved_at (timestamp — the ride's start), name, activity_type (set
  from Strava's `sport_type`, not `type` — every stored row is already filtered to
  `type` being `"Ride"` or `"VirtualRide"` (`StravaSyncJob::SYNCED_TYPES`), so
  `sport_type`'s finer granularity is the useful part), synced_at. `#indoor`/`#outdoor`
  scopes are the actual signal mileage attribution uses for indoor/outdoor, not the raw
  `trainer` column alone — confirmed empirically that Zwift's Strava integration does
  not reliably set `trainer: true` on its own uploads, so `activity_type == "VirtualRide"`
  also counts as indoor regardless of `trainer`. Also carries ride-analytics fields,
  surfaced on the Bike detail page's Ride history table (see "Ride history"
  below): `trainer`, `commute`, `moving_time`, `elapsed_time`, `average_speed`,
  `max_speed`, `total_elevation_gain`, `average_watts`, `weighted_average_watts`,
  `device_watts`, `kilojoules`, `average_heartrate`, `max_heartrate`,
  `average_cadence` — all nullable except `trainer`/`commute`, since Strava omits
  them entirely (not even `null`) when an activity has no power meter/HR
  monitor/cadence sensor. `#ride_kind` (`"outdoor"`/`"trainer"`/`"virtual"`) is the
  one server-derived classification backing that table's Type column — `"trainer"`
  and `"virtual"` together are exactly `#indoor?`, so the frontend never
  re-implements the indoor rule itself. `ignored_at` (nullable datetime) is a
  user's explicit "don't track this ride" decision, mirroring `StravaGear#ignored_at`'s
  shape but with no resurfacing concept — a ride's own data never changes after
  sync, so there's no later signal to resurface against (see "Strava integration"
  below). A validation (`not_ignored_while_attributed`) rejects `ignored_at` set
  while `bike_id` is present — a ride can only be ignored while unattributed, and
  `ignored_at` is never written from Strava's own data (there is none). Because
  `StravaActivity.reconcile_for_bike!` attributes via `update_all`, outside the
  validation's normal path, it clears `ignored_at` explicitly in that same
  statement wherever it sets `bike_id` to a real value; every *other* write path
  that can newly attribute a ride (sync, full refresh, single/bulk resync — see
  "Strava integration" below) goes through `Strava::ActivityUpsert`, the one
  shared place that applies the same rule (`attrs[:ignored_at] = nil if
  bike.present?`) — the validation itself exists to reject an invalid *write*,
  not to clean one up after the fact, so every writer still has to clear it
  deliberately. `.ignored`/`.not_ignored` scopes split on the column directly;
  `.needs_attention_for`/`.ignored_for` (class methods, same shape as
  `StravaGear.unmapped_for`/`.ignored_for`) are the shared definition of "needs
  attention" vs. "ignored" among a user's unattributed rides, factoring in
  gear-level ignores too (an unattributed ride whose gear is ignored counts as
  ignored, not needing attention) — every caller (`Dashboard::Summary`,
  `Strava::RideLog`, `StravaController#ignore_rides`'s `all_matching` branch, see
  below) goes through these rather than re-deriving the classification.
  `#attribution_status`/`#reason` are the per-row instance-method versions of the
  same classification, used once a batch of rides is already loaded (checking
  `ignored_at` before the gear-ignore check, so a ride that's both individually
  ignored and on ignored gear reports `"ride"`).
- `StravaCredential`: user_id (unique — one row per user), access_token, refresh_token,
  expires_at, athlete_id (also unique — one Strava athlete can't be attached to two
  different app accounts; the identity-linking rules in "Authentication" below are
  what makes this safe now that Strava is also a sign-in method, not just a data
  connection), scope, last_synced_at (nullable datetime). The latter is set
  at the end of every `StravaSyncJob#perform`, including a run that finds no new
  activities — the only "last completed sync" signal in the app (the incremental sync
  cursor itself is still just `StravaActivity.maximum(:moved_at)`, unrelated). It's
  what a `ServiceAlertDismissal` compares against to decide whether it's expired.
  Also carries `last_full_sync_at` (nullable datetime, set only at the end of a
  completed *full* refresh — see "Strava integration" below) and
  `full_sync_started_at` (nullable datetime, a short-lived lock set right before
  enqueuing a full refresh and cleared in the job's `ensure`, so a crashed job still
  releases it), and `sync_started_at` (nullable datetime, its incremental
  counterpart — a signal only, never a lock; see "Strava integration").
  `#sync_in_progress?` is either one set within `RUNNING_TIMEOUT`, backing
  `GET /strava/status`'s `sync_in_progress`. `#full_sync_available_at`/`#full_sync_available?` resolve both a
  15-minute post-completion cooldown (`FULL_SYNC_COOLDOWN`) and a 10-minute
  running-lock staleness fallback (`RUNNING_TIMEOUT`, in case the `ensure` never
  fires) into a single "available again at" timestamp or `nil`.
  `#full_sync_request_estimate` is roughly how many Strava API calls a full
  refresh would cost right now — `ceil(rides / 100) + 2 + gear` (rides/gear
  counted fresh from the DB each call, not cached) — used to decide whether
  resyncing a bulk selection of rides one by one or running a full refresh is
  cheaper (see "Strava rate limits" below). Also carries `last_sync_failed_at`
  (datetime), `last_sync_error` (string — a category code: `"rate_limited"`/
  `"strava_unavailable"`/`"auth_failed"`/`"unknown"`, never the raw exception
  message), `last_sync_failed_kind` (`"full"`/`"incremental"`), and
  `last_sync_retry_at` (datetime, only ever set alongside `"rate_limited"`) —
  set by `StravaSyncJob` when a run raises, cleared on the next successful run
  of either kind. These are how a failed sync stops failing silently; see
  "Strava integration" below.
- `StravaGear`: user_id, strava_gear_id, name, brand_name, model (DB column — the
  obvious `model_name` collides with `ActiveModel::Naming#model_name`, which every
  ActiveRecord model inherits; the API's JSON still calls it `model_name` for clarity),
  retired, distance_meters, synced_at, ignored_at (nullable datetime) — unique per
  (user_id, strava_gear_id). A cache populated by `Strava::GearSync`, not derived from
  activity history alone; `Strava::GearSync#upsert_gear`'s `update!` only ever sets the
  Strava-sourced columns above, so a re-sync never touches `ignored_at`. The latter is
  a user's explicit "don't track this gear" decision (pre-app Strava history that isn't
  worth creating a bike for) — see "Strava integration" below for the three-choice
  gear-mapping model this is part of. A gear is never both mapped (claimed by a
  `Bike#strava_gear_id`) and ignored at once (`StravaGear` validates this, and mapping
  always clears a prior ignore — see below); `StravaGear.ignored`/`.not_ignored` scopes
  split on it directly, while `.unmapped_for`/`.ignored_for` both also factor in
  resurfacing (below).

## Core logic

Strava gear tracking is per-bike, not per-component, so mileage attribution is computed
(not stored), via a service object or model method:

- `Component#total_distance` = sum of StravaActivity.distance where bike_id matches one
  of the component's assignments and moved_at falls within that assignment's
  half-open [started_at, ended_at) window — or [started_at, ∞) while still mounted —
  summed across all the component's assignments. The window is half-open so that an
  activity on a swap boundary is credited to exactly one assignment, never both.
  Each assignment's own `ride_context` additionally restricts this to only outdoor
  activities (`outdoor_only`), only indoor activities (`indoor_only`, via
  `StravaActivity#indoor` — trainer rides and Zwift/virtual rides both count), or no
  restriction (`"both"`, the default) — see `ComponentAssignment#activities_from`,
  the one shared windowing+filtering primitive every mileage computation (lifetime
  and per-installation-period alike) funnels through.
- `Component#distance_since(service_type:)` = same sum, filtered to activities after
  the most recent `MaintenanceEvent` of that `ServiceType`.

Both of the above loop over the component's assignments in Ruby, issuing one
date-bounded query per assignment — unlike `Bike`'s stats, which batch into a single
grouped query per stat in `BikesController#index`. This is still fine today because
every current caller of these two specific methods (`ComponentDetail`, and a bike's
own small "Installed components" table) only ever renders a handful of components at
once; neither is used to back a many-row table column. For lifetime distance across
many components, use `Maintenance::LifetimeDistanceQuery.call(user, component_ids:)`:
the same windows and ride-context rules in one grouped query, with a parity spec
against `#total_distance`. The Bikes list's cards use it. For a many-row table, use the batched pattern instead: `Maintenance::BatchedPositionQuery` (see "Service intervals and maintenance
alerts" below) implements the batched join — a
`component_assignments` ⨝ `strava_activities` join on `bike_id` with a `moved_at`
range condition, `GROUP BY` the thing being measured — for service-requirement
distance/moving-time-since-baseline instead of `total_distance`, since that's what
actually needed to show on a many-row table (the Components list's Service column and
Bike detail's `service_status` column). If `total_distance`/`distance_since` themselves ever need
to back a many-row column too, the same pattern is ready to reuse.

