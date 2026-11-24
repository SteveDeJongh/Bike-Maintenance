# Strava integration

> Reference material split out of CLAUDE.md. A quoted cross-reference such as "see \"Strava integration\"" names a `##` section heading; CLAUDE.md's "Further docs" list says which docs/ file holds each heading.

## Strava integration

- OAuth scope: `activity:read_all,profile:read_all`. `profile:read_all` is needed so
  `GET /athlete` returns the athlete's `bikes` array — confirmed empirically that
  without it, `GET /athlete` omits `bikes`/`shoes` entirely.
- `app/services/strava/client.rb` wraps the HTTP calls (token exchange/refresh,
  paginated activity fetch, `GET /athlete`, `GET /gear/{id}`) via Faraday;
  `StravaCredential#ensure_fresh_access_token!` decides when to refresh (6-hour access
  token expiry) and persists Strava's rotated refresh_token — if Strava rejects the
  refresh (a revoked/invalid refresh_token) with a 400/401, this raises
  `Strava::Client::AuthenticationError` rather than the generic `Error` (see
  `StravaSyncJob`'s failure recording below). `client_id`/`client_secret`
  live in `config/credentials.yml.enc` under a `strava:` key (`bin/rails
  credentials:edit`) — required before `GET /auth/strava` will work. `redirect_uri` is
  built from the current request's host (the `strava_callback_url` route helper), not
  a fixed config value.
- `StravaController#authorize`/`#callback` live at `GET /auth/strava`/`GET
  /auth/strava/callback` (the Strava app's "Authorization Callback Domain" setting is just a domain, e.g. `localhost`, not a full path). Both skip
  `require_authentication`: this is the one OAuth flow that's also a sign-in method
  (see "Authentication" below), so it has to work with no session at all.
  `authorize` generates a random `state`, stores it in `session[:strava_oauth_state]`,
  and passes it through; `callback` verifies it matches before doing anything else,
  redirecting with `?error=invalid_state` otherwise — without this, a victim's browser
  could be made to finish the callback with an attacker's code, linking the attacker's
  Strava athlete to the victim's account.
- Sync is triggered manually for now (`POST /strava/sync` enqueues `StravaSyncJob`) via
  a "Sync now" button on the frontend's `/strava` page. `bin/rails strava:sync_all`
  exists for a future production scheduler (e.g. a Render Cron Job) to call once the app
  is actually deployed — not wired up to anything automatic yet, since there's no
  deployed host. Once the app is deployed and subscribed, ride creates, edits and
  deletes arrive by webhook (see "Webhooks" below); gear changes still need a sync.
- `StravaSyncJob` pages `GET /athlete/activities` incrementally, using
  `StravaActivity.maximum(:moved_at) - CURSOR_OVERLAP` (3 days) as the `after` cursor
  (no separate "last synced" column). The overlap exists because webhook events write
  rides too: if ride A's event fails and a later ride B's succeeds, a cursor of B alone
  would skip A forever. Upserts are idempotent, so the overlap only re-reads a few rides. Only `Ride`/`VirtualRide`-type activities are stored (`SYNCED_TYPES`) — the
  latter is what Zwift/virtual-trainer rides come back as, a distinct `type` from plain
  `"Ride"`, not a flag on a Ride. It also runs `Strava::GearSync` once after paging
  finishes, so the gear cache stays current on every routine sync. `perform(user_id,
  full_resync: true)` ignores the incremental cursor and re-fetches from the beginning of
  the user's history — the cursor only looks forward from the latest already-stored
  activity, so it can't backfill history from before a change like widening
  `SYNCED_TYPES`; safe to run repeatedly. Every row's actual write goes through
  `Strava::ActivityUpsert.call(user:, activity:, raw:, bike:)` — the one place a raw
  Strava payload gets applied to a `StravaActivity`, including the
  attribution-clears-`ignored_at` rule (see the data model above). The job itself
  only resolves `activity`/`bike` from two hashes preloaded *once per run*
  (`bikes_by_gear_id`, `activities_by_strava_id`) rather than querying per row — the
  dominant cost on a full resync's thousands of rows; `StravaController#resync_ride`/`#resync_rides` (below) resolve the same two
  values per row instead (there's only ever one or a handful of rows), but call the
  exact same `Strava::ActivityUpsert`, so the two paths can never drift on
  attribution rules. `bin/rails strava:resync_all` runs a full resync for every
  connected user. Paging is capped at `MAX_PAGES = 50` (5,000 rides) for an
  incremental sync, or `FULL_SYNC_MAX_PAGES = 200` (20,000 rides) for a full resync —
  a full history fetch is far more likely to need more pages than an incremental one
  ever does (see "Strava rate limits" below for why 200 pages is still not always
  enough to finish in one go).
- **Full refresh**: `POST /strava/sync` with `{ full: true }` is the one user-triggered
  way to pick up rides edited, moved to different gear, or deleted on Strava after the
  fact — the incremental cursor only ever looks forward, so it can never see those
  changes. Gated by `StravaCredential#full_sync_available_at` (a 15-minute post-completion
  cooldown plus a 10-minute running-lock staleness fallback — see the data model above);
  blocked, the endpoint responds `429` with `{ retry_at: }` and enqueues nothing.
  Surfaced on the frontend as a "Refresh all rides" button next to "Sync now" on the
  `/strava` page, disabled during the cooldown with the available-again time shown.
  `StravaSyncJob#perform(user_id, full_resync: true)` additionally **reconciles**: it
  tracks every `strava_id` seen whose `type` is in `SYNCED_TYPES` while paging (a ride
  that changed to an excluded type, e.g. "Run", is simply never added to this set —
  indistinguishable from a deleted one, which is exactly the behavior wanted), then after
  paging finishes *without raising* — the failure-recording `rescue` below still
  re-raises every error after recording it, so an error during paging means
  reconciliation is never reached, by construction — applies guards in order: paging hit the page cap → skip the delete entirely (the "did
  we see everything" guarantee is void) but still record `last_full_sync_at`; paging
  ended naturally but found zero activities while local rows exist → log a warning and
  skip the delete (a suspiciously empty response, not trusted); otherwise →
  `user.strava_activities.where.not(strava_id: seen_strava_ids.to_a).delete_all` (plain
  `delete_all`, no callbacks need to run — nothing else in the schema references a
  `strava_activities.id`) and log the deleted count. **Deleting a reconciled-away ride
  changes bike/component mileage and requirement statuses retroactively — this is intended,
  matching Strava, not a gap.** `full_sync_started_at` is set by the controller right
  before enqueuing and cleared by the job in an `ensure`, so a crashed job still releases
  the lock (the staleness fallback above covers the case where even the `ensure` never
  ran, e.g. a killed worker process). `GET /strava/status` exposes `last_full_sync_at`/`full_sync_available_at`/`full_sync_request_estimate` (data model above) and `max_bulk_resync` (below) alongside the existing incremental fields, plus the four failure columns described below, and `sync_in_progress`.

  **`sync_in_progress`** (`StravaCredential#sync_in_progress?`) is true while either
  kind of sync is running: `sync_started_at` (incremental) or `full_sync_started_at`
  set within `RUNNING_TIMEOUT`, which also self-heals a flag a killed worker never
  cleared. `sync_started_at` is a **signal, not a lock** — no 429, overlapping
  incremental runs stay allowed. Both columns are set by `StravaController#sync`
  right before enqueueing (so the very next status read sees it) *and* re-stamped by
  `StravaSyncJob#perform` at the start of every run (so `strava:sync_all` or a
  future scheduler reports too), and cleared in the job's `ensure` on success and
  failure alike. It's what the frontend's always-mounted
  `useSyncCompletionWatcher` (see "Dashboard") polls on. Known gap, accepted for a
  signal-only flag: two overlapping incremental runs share one column, so the first
  to finish clears it and the watcher stops polling early — the second's completion
  is then picked up on the next window focus.

  **Failed syncs are recorded, not silent**: `StravaSyncJob#perform` wraps each
  run (incremental and full both) in a `rescue StandardError => e;
  record_failure(credential, e, kind:); raise` — it still re-raises (the job
  must keep reporting as failed to whatever runs it), but first stores a
  category on the credential via `update_columns` (bypasses validations, so
  recording a failure can't itself fail to save): `"rate_limited"` for a
  `Strava::Client::RateLimitedError`, `"auth_failed"` for an
  `AuthenticationError` (the OAuth token endpoint rejecting a revoked/invalid
  refresh_token — see "Strava rate limits" below), `"strava_unavailable"` for
  any other `Strava::Client::Error` or a Faraday timeout/connection failure,
  `"unknown"` otherwise. A rate-limited failure also stores `last_sync_retry_at`
  from the error's own `retry_at`. For the full path, this `rescue` runs (and
  records) *before* the pre-existing `ensure` that clears
  `full_sync_started_at` — Ruby runs `ensure` as the exception continues
  propagating out of the `begin` block, so the lock release is unaffected. A
  successful run (either kind) clears all four failure columns in the same
  `credential.update!` call that already sets `last_synced_at`/
  `last_full_sync_at`. Because `last_full_sync_at` is only ever set on that same
  success path — never reached if the run raised — a failed full refresh can't
  start the 15-minute cooldown, by construction. See `useStravaSyncRunner`
  below for how the frontend surfaces this.
- `Strava::GearSync` (`app/services/strava/gear_sync.rb`) populates `StravaGear`: the
  known gear id set is the union of the athlete's current `GET /athlete` bikes list and
  every `gear_id` ever seen in synced activity history (kept even if Strava's athlete
  summary omits retired gear — unconfirmed either way, so the union avoids silently
  losing a known id), then each id gets enriched via `GET /gear/{id}` (name, brand,
  model, retired — none of which the activity or athlete endpoints provide). Runs on
  every sync, and via a dedicated "Refresh gear list" button (`POST
  /strava/refresh_gear`) for picking up a newly-added, not-yet-ridden bike immediately.
- Gear-to-bike mapping has no separate screen — it reuses the existing Bike edit form's
  "Strava gear ID" field (`PATCH /bikes/:id`), surfaced through the `/strava` page's
  list of currently-unmapped gear (`GET /strava/unmapped_gear`, sourced from the
  `StravaGear` cache, not activities directly — shows name/brand/model/retired status).
  Setting/changing a bike's `strava_gear_id` triggers reconciliation automatically (a
  `Bike` `after_save` callback, not `after_update` — it has to also fire when a bike is
  *created* with `strava_gear_id` already set, e.g. from the gear-mapping screen's
  "create new bike" flow). It handles both directions via
  `saved_change_to_strava_gear_id`'s old/new pair: activities matching the old gear id
  get `bike_id` nulled out, activities matching the new one get backfilled — needed for
  "unlink"/reassign on the Mapped gear section to be correct, not just additive. The
  same callback also clears `StravaGear#ignored_at` on the newly-mapped gear (a gear is
  never both mapped and ignored — see below) — one fix here covers `reassign_gear` too,
  since it maps gear by saving a `Bike`, routing through this same callback.
- A row of unmapped gear isn't limited to "map it to a bike" — most unmapped gear is
  pre-app Strava history (an old or retired bike) that doesn't need a tracked bike at
  all, and component mileage is already scoped to dated `ComponentAssignment` windows,
  so old rides never affect wear either way. Each row on `/strava` offers three
  choices: map to a bike (above), **track as retired bike** (a one-click `Bike` create
  from the gear's own name/brand/model, `strava_gear_id`, and `retired_on` defaulted to
  the gear's last activity date when known, else today — reuses the normal create-bike
  flow, so it still backfills activities the same way), or **don't track**
  (`POST /strava/ignore_gear`, sets `StravaGear#ignored_at`; rejected with a validation
  error if the gear is already mapped). Ignoring only filters what's shown/counted —
  syncing and storing that gear's activities continues unchanged, and un-ignoring
  (`POST /strava/unignore_gear`) takes effect instantly with no re-sync needed.
  **Resurfacing**: if an ignored gear gets a new activity dated after `ignored_at`
  (e.g. a bike un-retired on Strava), it's treated as no longer ignored for
  display/counting — it reappears in `GET /strava/unmapped_gear` (flagged
  `resurfaced: true`) instead of `GET /strava/ignored_gear`, computed at read time via
  `StravaGear::RESURFACED_CONDITION`, never by auto-clearing `ignored_at` itself
  (re-ignoring just sets it to now again). Retired gear is never auto-ignored — retired
  on Strava often still means "this bike's history matters," especially when parts
  moved to a newer bike.
- **Ride-level ignore and the Rides tab**: the `/strava` page is two Mantine `Tabs`
  (`?tab=gear` default, `?tab=rides`) — Gear is the section above, unchanged; Rides is
  `GET /strava/rides` (`Strava::RideLog`, plain ActiveRecord `where`/`order`/`offset`/
  `limit` over `StravaActivity.needs_attention_for`/`.ignored_for`/unfiltered — no raw
  SQL needed, unlike `Bikes::RideHistory`, since this list has no per-bike odometer to
  compute), filterable by `status` (`attention`/`ignored`/`all`, default `attention`),
  `bike_id` (only applied for `all`), sorted by `date`/`distance`. Each ride's
  `attribution`/`reason` (from `StravaActivity#attribution_status`/`#reason`, see the
  data model above) drives a status badge and which row action shows: ignore (needs
  attention), un-ignore (ignored by its own `ignored_at`, never offered for a
  gear-ignored row — there's nothing on the ride itself to un-set), or "Resolve gear"
  (an `unmapped_gear` row, linking to `?tab=gear&gear=<id>` — the Gear tab's matching
  Unmapped gear row scrolls to and briefly highlights itself on mount when that param
  is present). An attributed row (in practice, the `all` view) gets the shared
  "Log service after this ride" action beside Re-sync instead — see "Ride history". `POST /strava/rides/ignore` (by `activity_ids` or `all_matching: true`
  — the latter always resolves against `needs_attention_for` server-side) and `POST
  /strava/rides/unignore` both silently skip ineligible ids rather than erroring,
  matching the gear-ignore flow's "no confirm modal, fully reversible" philosophy. The
  Rides tab adopts the sortable/configurable-table system as its eighth table
  (`strava_rides`, see "Sortable, configurable tables" below) with bulk selection
  ("select all N matching" resolved server-side, not limited to loaded rows) layered on
  top; its own `status`/`bike_id`/`sort`/`order` are local ephemeral state, not
  persisted via `TableViewPreference`, same convention as Ride history's own
  `typeFilter`. A tab badge shows the live `attention` count even while the Gear tab is
  active, sourced from the same query the Rides tab itself uses so the two never
  disagree. `app/services/strava/ride_serialization.rb`
  (`Strava::RideSerialization::ATTRIBUTES`/`.base_json`) is the one shared ride-field
  serializer behind both this endpoint and the Bike detail page's own
  `GET /bikes/:id/rides` (see "Ride history" below) — no duplicated attribute list.
  The Dashboard's sync banner and "No bike" recent-ride rows link here too (`?tab=rides`
  for review/ignore, `?tab=gear` for gear mapping specifically).
- **Single and bulk resync**: a full refresh is the only way to pick up a Strava
  edit, but it costs `full_sync_request_estimate` calls regardless of how small
  the actual fix was — too slow for "I fixed the gear on one ride." `POST
  /strava/rides/:id/resync` re-fetches that one activity (`GET
  /activities/{id}`, one call) through `Strava::ActivityRefresh` (shared with
  the webhook job), which upserts via `Strava::ActivityUpsert` exactly like the
  sync job does; a 404, or a type that's since changed to
  something `SYNCED_TYPES` excludes, deletes the local row — the same
  "indistinguishable from deleted" rule full-refresh reconciliation already
  uses. `POST /strava/rides/resync` (`{ activity_ids: [...] }`) is the bulk
  companion backing the Rides tab's "Needs attention" selection toolbar's
  "Resync selected" — `StravaController::MAX_BULK_RESYNC` (25) is a hard cap
  (`422` above it, not a silent truncation — a real request should never hit
  this; see the frontend routing below) on top of refreshing the access token
  once up front rather than once per row. Both actions deliberately skip
  `last_synced_at`/`last_full_sync_at`/`Strava::GearSync#call` — this is a
  standalone action, not a sync cycle — but each one **does** backfill
  `StravaGear` for any gear_id it doesn't already have cached (a bike added on
  Strava since the last sync), via `Strava::GearSync#sync_gear(gear_id)`
  (`Strava::UncachedGear`, one fetch per distinct new gear id even across a
  whole bulk batch, not per ride: the bulk path passes `backfill_gear: false`
  to `ActivityRefresh` and backfills once at the end) — without this, a resynced ride
  could carry a gear_id the Gear tab and the Rides tab's own Gear column had
  never heard of, until the next full/incremental sync. See "Strava rate
  limits" below for the stop-on-rate-limit behavior both actions share, and why
  bulk resync has no `all_matching` variant the way ignore does.

  **Frontend routing**: the Rides tab computes `threshold = min(max_bulk_resync,
  full_sync_request_estimate)` from `GET /strava/status`. A selection at or
  under that threshold shows "Resync selected" as always; a larger selection,
  or "select all N matching" (which has no bounded id list to resync
  individually at all), shows "Refresh all rides" instead, with a dimmed line
  spelling out the call-count tradeoff. That button fires the *same*
  `useStravaSyncRunner({ full: true })` instance the Strava page header already
  owns — `Strava.tsx` passes it down to `RidesTab` as a `fullSync` prop (the
  same lift-state-as-props pattern `Dashboard.tsx` already uses for
  `DashboardHeader`) rather than the tab running a second independent poller for the
  same action.
- **Strava rate limits**: Strava's defaults are 100 read requests per 15
  minutes / 1,000 per day, and 200/2,000 overall; a request rejected for the
  15-minute limit still counts toward the daily one. The 15-minute window
  resets at `:00`/`:15`/`:30`/`:45` UTC. Every response carries
  `X-ReadRateLimit-Limit`/`-Usage` and `X-RateLimit-Limit`/`-Usage`, each a
  `"<15min>,<daily>"` pair — `Strava::Client` parses both on a 429 into
  `RateLimitedError#read_limit`/`#read_usage`/`#overall_limit`/`#overall_usage`,
  plus `#retry_at` (the next window boundary, computed from `Time.current`, not
  parsed from a header Strava doesn't send). Per-action cost, as the code
  stands: a single resync is 1 call; bulk resync of *k* rows is *k* calls (plus
  one gear-fetch call per distinct new gear id); a full refresh is roughly
  `ceil(rides / 100)` listing pages + 1 empty final page + 1 `GearSync`
  `fetch_athlete` call + 1 `fetch_gear` call per distinct gear
  (`full_sync_request_estimate`'s own formula). Resyncing *k* rows one by one
  only beats a full refresh while *k* is smaller than that estimate — the
  break-even depends on the user's own history size, which is why it's
  computed (`full_sync_request_estimate`), never hardcoded.
  `FULL_SYNC_MAX_PAGES` (200) itself can exceed one 15-minute read window — a
  history over roughly 9,000 rides can't finish a full refresh in a single
  window. It fails safely in that case: `StravaSyncJob` hits the
  `RateLimitedError` mid-page, so (per the no-rescue-reaches-reconciliation
  design above) nothing gets reconciled/deleted, and the failure is recorded as
  `"rate_limited"` with `last_sync_retry_at` set, same as any other failure.
  **Stop-on-rate-limit in resync**: an ordinary `Strava::Client::Error` (5xx/
  timeout) on one row of a bulk resync is counted as `failed_count` and the
  batch continues — partial progress beats an all-or-nothing retry on a
  transient blip. A `RateLimitedError` is different: every remaining call would
  fail too and still count against the daily limit, so `resync_rides` stops the
  batch immediately instead, reporting `not_attempted_count` and `retry_at`
  alongside whatever counts it had so far (a `200`, not an error — the rows
  before it still committed). `resync_ride` (single) responds `429` with
  `retry_at` for the same case, instead of the generic `502` any other
  `Strava::Client::Error` gets.

- Bike-level stats (`Bike#total_distance`/`#total_moving_time`/`#first_ride_on`/
  `#last_ride_on`/`#total_elevation_gain`/`#installed_components_count`, shown on the
  Bikes list and detail page) sum/min/count directly over `strava_activities`/
  `component_assignments` — computed, not stored. `Bike#average_power` is the same,
  but restricted to `device_watts: true` activities (real power meter, not Strava's
  estimate) and **nil** (not 0) when the bike has none, so the UI can show "N/A"
  instead of a misleading "0 W". `BikesController#index` computes all of these via
  grouped queries (one per stat) to avoid per-bike N+1 on the list, plus the Bikes
  page's card fields (see "Bikes page" in `docs/frontend-ui.md`).
   `BikesController#show` merges each
  installed component's batched `service_status` into the response the same way
  `#index` merges its own grouped stats.

## Webhooks

Strava's push subscription tells the app, within seconds, that something changed for
an athlete who authorized it, so new, edited and deleted rides arrive without "Sync now".

- **One subscription per Strava app**, covering every athlete. It's managed with:
  - `bin/rails "strava:webhook:subscribe[https://<host>/strava/webhook]"`, which prints
    the new id to store as `strava.webhook_subscription_id`, or the existing
    subscription if there already is one;
  - `bin/rails strava:webhook:show`;
  - `bin/rails strava:webhook:unsubscribe`.

  A dev-tunnel subscription has to be deleted before production can subscribe.
- **Credentials** (`strava:` in `config/credentials.yml.enc`):
  - `webhook_verify_token`: a long random string Strava echoes back when validating.
  - `webhook_subscription_id`: optional; once set, events for any other subscription
    are ignored.
- **`GET /strava/webhook`** (`StravaWebhooksController#verify`): Strava's validation
  request on subscribe. It answers `{"hub.challenge": …}` when `hub.mode` is
  `subscribe` and `hub.verify_token` matches the credential (`secure_compare`).
  Anything else is `403`, including an unset or blank credential.
- **`POST /strava/webhook`** (`#receive`):
  - It skips `require_authentication` and forgery protection, since Strava sends no
    session and no CSRF token.
  - Events aren't signed, so the payload is only ever "something changed for athlete X
    / activity Y". `receive` permits the fields, logs them (`[StravaWebhook]`, info
    level), enqueues `StravaWebhookEventJob` and returns `200`. It makes no Strava
    calls and runs no queries, so it stays well inside Strava's 2-second limit.
  - It returns `400` only when a required field is missing. A non-200 just makes
    Strava retry, up to three attempts.
- **`StravaWebhookEventJob`** finds the `StravaCredential` by `owner_id`; with none, it
  logs and returns. Then:

  | Event | Handling |
  |---|---|
  | activity `create` / `update` | `ensure_fresh_access_token!`, then `Strava::ActivityRefresh` re-fetches the activity whatever `updates` lists (one call, and it covers type and visibility changes). A synced type is upserted and attributed by gear; an excluded type or a `404` deletes the row, like full-refresh reconciliation. |
  | activity `delete` | Destroys the user's row with that `strava_id`, if any. No API call. |
  | athlete `update` with `updates.authorized == "false"` | Deauthorization: destroys the credential, since its tokens are dead. Rides, gear and the Strava `UserIdentity` are kept for now. Whether deauthorization should delete Strava-sourced data is open, pending a read of Strava's API agreement. The app then shows its usual "not connected" states. |
  | anything else | Logged and ignored. |

- **Errors:**
  - **Rate limit:** re-enqueued at the error's `retry_at` (15 minutes if unset), 3
    attempts, through `rescue_from`, because `retry_on`'s `wait:` proc never sees the
    error.
  - **Other `Strava::Client::Error`s and Faraday timeouts:** polynomial backoff, 4
    attempts.
  - **`AuthenticationError`** (revoked refresh token): logged and discarded.

  The job never writes `last_sync_failed_*`, `sync_started_at` or `last_synced_at`. A
  webhook isn't a sync run, and `useSyncCompletionWatcher` mustn't start polling
  because of one.
- **Idempotency:** one save on Strava can send several events (a title, then a type).
  Re-processing re-fetches and upserts the same values. Two events for one new ride can
  race to insert the same `strava_id` (unique). The losing `ActivityRefresh` re-finds
  the row and upserts onto it.
- **Not covered: gear changes.** Strava documents `updates` keys only for `title`,
  `type` and `private`, and doesn't say a gear change fires an event. Gear changes still
  need the scheduled sync or "Refresh all rides".
- **Lost jobs:** the dev/default async adapter runs jobs in-process, so a webhook job
  still queued when the process restarts is lost. The scheduled incremental sync, with
  its `CURSOR_OVERLAP`, is the backstop. Choosing a durable adapter is a deploy
  decision.
- **Manual end-to-end check before deploying** (not part of the test suite):
  1. Run the API behind a tunnel: `cloudflared tunnel --url http://localhost:3000`.
  2. Run `bin/rails "strava:webhook:subscribe[https://<tunnel>/strava/webhook]"`.
  3. Edit a ride's title on Strava and watch `log/development.log` for
     `[StravaWebhook]`.
  4. Run `bin/rails strava:webhook:unsubscribe`, so production can subscribe later.
