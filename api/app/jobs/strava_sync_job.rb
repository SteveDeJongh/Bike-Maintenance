class StravaSyncJob < ApplicationJob
  queue_as :default

  MAX_PAGES = 50
  # A full refresh fetches a user's entire history in one run, not just
  # what's new since the cursor -- far more likely to need more pages than
  # an incremental sync ever does. 200 pages x 100 is 20,000 rides, a
  # generous ceiling for a personal app while still bounded.
  FULL_SYNC_MAX_PAGES = 200

  # full_resync: true ignores the incremental cursor and re-fetches from the
  # beginning of the user's Strava history -- needed after loosening which
  # activity types get synced (e.g. VirtualRide), since the cursor only looks
  # forward from the latest already-stored activity and has no way to know
  # history before that point is missing anything. Safe to run repeatedly:
  # upsert_activity's find_or_initialize_by makes every call idempotent.
  #
  # On a full refresh, also reconciles: deletes local rides whose strava_id
  # wasn't seen anywhere in a *complete* listing -- covers both a ride
  # deleted on Strava and a ride whose type changed to something
  # SYNCED_TYPES excludes (it still comes back in the listing, just never
  # added to seen_strava_ids, so it's indistinguishable from a deleted one).
  # No rescue is added here deliberately -- this job already propagates any
  # token-refresh/non-2xx/rate-limit error uncaught, and reconciliation runs
  # strictly after the full listing succeeds, so an error anywhere in the
  # loop means reconciliation (and last_full_sync_at) is simply never
  # reached, by construction.
  def perform(user_id, full_resync: false)
    user = User.find(user_id)
    credential = user.strava_credential
    return if credential.nil?

    if full_resync
      begin
        run_sync(user, credential, full_resync: true)
      ensure
        credential.update_column(:full_sync_started_at, nil)
      end
    else
      run_sync(user, credential, full_resync: false)
    end
  end

  private

  SYNCED_TYPES = %w[Ride VirtualRide].freeze

  def run_sync(user, credential, full_resync:)
    access_token = credential.ensure_fresh_access_token!
    after = full_resync ? nil : user.strava_activities.maximum(:moved_at)&.to_i
    client = Strava::Client.new
    max_pages = full_resync ? FULL_SYNC_MAX_PAGES : MAX_PAGES
    seen_strava_ids = Set.new
    page = 1
    ended_naturally = false

    while page <= max_pages
      activities = client.fetch_activities(access_token: access_token, after: after, page: page, per_page: 100)
      if activities.empty?
        ended_naturally = true
        break
      end

      activities.each do |raw|
        next unless SYNCED_TYPES.include?(raw["type"])

        seen_strava_ids << raw["id"] if full_resync
        upsert_activity(user, raw)
      end
      page += 1
    end

    Strava::GearSync.new(user).call

    reconcile!(user, seen_strava_ids, ended_naturally) if full_resync
    credential.update!(last_synced_at: Time.current, **(full_resync ? { last_full_sync_at: Time.current } : {}))
  end

  # Only ever called when the listing completed without raising -- see the
  # no-rescue note above. Still only deletes when the listing ended
  # naturally (an empty page, not the page cap) and found at least one
  # activity, or had none to find in the first place.
  def reconcile!(user, seen_strava_ids, ended_naturally)
    return unless ended_naturally

    local_count = user.strava_activities.count
    if seen_strava_ids.empty? && local_count.positive?
      Rails.logger.warn(
        "StravaSyncJob full resync for user #{user.id}: listing returned zero activities while " \
        "#{local_count} local rides exist -- skipping reconciliation delete (suspect response).",
      )
      return
    end

    deleted = user.strava_activities.where.not(strava_id: seen_strava_ids.to_a).delete_all
    Rails.logger.info("StravaSyncJob full resync for user #{user.id}: reconciliation deleted #{deleted} rides no longer on Strava.") if deleted.positive?
  end

  def upsert_activity(user, raw)
    return unless SYNCED_TYPES.include?(raw["type"])

    activity = user.strava_activities.find_or_initialize_by(strava_id: raw["id"])
    resolved_bike_id = user.bikes.find_by(strava_gear_id: raw["gear_id"])&.id

    attrs = {
      user: user,
      name: raw["name"],
      distance_meters: raw["distance"].to_i,
      moved_at: raw["start_date"],
      activity_type: raw["sport_type"],
      gear_id: raw["gear_id"],
      bike_id: resolved_bike_id,
      synced_at: Time.current,
      trainer: raw["trainer"] || false,
      commute: raw["commute"] || false,
      moving_time: raw["moving_time"],
      elapsed_time: raw["elapsed_time"],
      average_speed: raw["average_speed"],
      max_speed: raw["max_speed"],
      total_elevation_gain: raw["total_elevation_gain"],
      average_watts: raw["average_watts"],
      weighted_average_watts: raw["weighted_average_watts"],
      device_watts: raw["device_watts"],
      kilojoules: raw["kilojoules"],
      average_heartrate: raw["average_heartrate"],
      max_heartrate: raw["max_heartrate"],
      average_cadence: raw["average_cadence"],
    }
    # Never writes ignored_at based on Strava data (there is none) -- but
    # attribution becoming true is a distinct, deliberate rule: a ride is
    # never both attributed and ignored, and omitting this would make a
    # re-attributing sync raise RecordInvalid against that validation
    # instead of resolving cleanly. Omitted entirely (not just false-y) when
    # still unattributed, so a manual ignore is never touched.
    attrs[:ignored_at] = nil if resolved_bike_id.present?

    activity.update!(attrs)
  end
end
