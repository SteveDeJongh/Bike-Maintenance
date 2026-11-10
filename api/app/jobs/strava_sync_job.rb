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
  # upsert_activity's find-or-build-by-strava_id lookup (against a hash
  # preloaded once per run, not re-queried per row) makes every call
  # idempotent.
  #
  # On a full refresh, also reconciles: deletes local rides whose strava_id
  # wasn't seen anywhere in a *complete* listing -- covers both a ride
  # deleted on Strava and a ride whose type changed to something
  # SYNCED_TYPES excludes (it still comes back in the listing, just never
  # added to seen_strava_ids, so it's indistinguishable from a deleted one).
  # Reconciliation runs strictly after the full listing succeeds, so an
  # error anywhere in the loop means reconciliation (and last_full_sync_at)
  # is simply never reached, by construction -- the rescue below exists to
  # *record* that a run failed (see record_failure), not to swallow the
  # error; it still re-raises so the job reports as failed.
  def perform(user_id, full_resync: false)
    user = User.find(user_id)
    credential = user.strava_credential
    return if credential.nil?

    if full_resync
      begin
        run_sync(user, credential, full_resync: true)
      rescue StandardError => e
        record_failure(credential, e, kind: "full")
        raise
      ensure
        credential.update_column(:full_sync_started_at, nil)
      end
    else
      begin
        run_sync(user, credential, full_resync: false)
      rescue StandardError => e
        record_failure(credential, e, kind: "incremental")
        raise
      end
    end
  end

  private

  SYNCED_TYPES = %w[Ride VirtualRide].freeze

  # Stores a category code, never the raw exception message, so
  # GET /strava/status has something stable and user-facing to key UI copy
  # off of. update_columns bypasses validations (can't itself fail to save)
  # and skips callbacks, which nothing here needs.
  def record_failure(credential, error, kind:)
    attrs = {
      last_sync_failed_at: Time.current,
      last_sync_error: classify_error(error),
      last_sync_failed_kind: kind,
    }
    attrs[:last_sync_retry_at] = error.retry_at if error.is_a?(Strava::Client::RateLimitedError)
    credential.update_columns(attrs)
  end

  def classify_error(error)
    case error
    when Strava::Client::RateLimitedError then "rate_limited"
    when Strava::Client::AuthenticationError then "auth_failed"
    when Strava::Client::Error, Faraday::TimeoutError, Faraday::ConnectionFailed then "strava_unavailable"
    else "unknown"
    end
  end

  def run_sync(user, credential, full_resync:)
    access_token = credential.ensure_fresh_access_token!
    after = full_resync ? nil : user.strava_activities.maximum(:moved_at)&.to_i
    client = Strava::Client.new
    max_pages = full_resync ? FULL_SYNC_MAX_PAGES : MAX_PAGES
    seen_strava_ids = Set.new
    page = 1
    ended_naturally = false

    # Preloaded once per run, not re-queried per activity -- upsert_activity
    # used to issue a Bike lookup and a StravaActivity lookup per row, which
    # is the dominant cost on a full resync's 2,000+ rows (bikes are few;
    # activities_by_strava_id covers the "does this row already exist"
    # check that find_or_initialize_by was doing one row at a time).
    bikes_by_gear_id = user.bikes.where.not(strava_gear_id: nil).index_by(&:strava_gear_id)
    activities_by_strava_id = user.strava_activities.index_by(&:strava_id)

    while page <= max_pages
      activities = client.fetch_activities(access_token: access_token, after: after, page: page, per_page: 100)
      if activities.empty?
        ended_naturally = true
        break
      end

      activities.each do |raw|
        next unless SYNCED_TYPES.include?(raw["type"])

        seen_strava_ids << raw["id"] if full_resync
        upsert_activity(user, raw, bikes_by_gear_id, activities_by_strava_id)
      end
      page += 1
    end

    Strava::GearSync.new(user).call

    reconcile!(user, seen_strava_ids, ended_naturally) if full_resync
    credential.update!(
      last_synced_at: Time.current,
      last_sync_failed_at: nil, last_sync_error: nil, last_sync_failed_kind: nil, last_sync_retry_at: nil,
      **(full_resync ? { last_full_sync_at: Time.current } : {}),
    )
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

  def upsert_activity(user, raw, bikes_by_gear_id, activities_by_strava_id)
    return unless SYNCED_TYPES.include?(raw["type"])

    activity = activities_by_strava_id[raw["id"]] ||= user.strava_activities.build(strava_id: raw["id"])
    bike = bikes_by_gear_id[raw["gear_id"]]

    Strava::ActivityUpsert.call(user: user, activity: activity, raw: raw, bike: bike)
  end
end
