class StravaController < ApplicationController
  # Hard cap on POST /strava/rides/resync's explicit activity_ids list --
  # see that action's own comment for why (unbounded synchronous Strava
  # calls, unlike ignore_rides' single update_all). 25 calls finish in a
  # few seconds and keeps one click to a quarter of a 15-minute read
  # window. The frontend routes a larger selection to a full refresh
  # instead (see Strava::RideLog/the Rides tab) well before this would ever
  # be hit by a real request -- this is the defensive backstop.
  MAX_BULK_RESYNC = 25

  # Strava sign-in and the Strava data connection are the same OAuth grant
  # -- this callback serves both, decided by whether a session user exists
  # going in (see Auth::ResolveIdentity). So, unlike every other action
  # here, these two must work without already being authenticated.
  skip_before_action :require_authentication, only: %i[authorize callback]

  def authorize
    session[:strava_oauth_state] = SecureRandom.hex(24)
    redirect_to strava_authorize_url, allow_other_host: true
  end

  def callback
    if params[:error].present?
      return redirect_to Frontend.url("/strava?error=#{params[:error]}"), allow_other_host: true
    end

    expected_state = session.delete(:strava_oauth_state)
    if expected_state.blank? || params[:state] != expected_state
      return redirect_to Frontend.url("/strava?error=invalid_state"), allow_other_host: true
    end

    signed_in_user = current_user
    token_data = Strava::Client.new.exchange_code(params[:code])
    athlete = token_data.fetch("athlete", {})

    result = Auth::ResolveIdentity.new(
      provider: "strava",
      uid: athlete["id"].to_s,
      name: [athlete["firstname"], athlete["lastname"]].compact.join(" ").presence,
      current_user: signed_in_user,
    ).call

    reset_session if signed_in_user.nil? || signed_in_user.id != result.user.id
    session[:user_id] = result.user.id

    credential = result.user.strava_credential || result.user.build_strava_credential
    credential.update!(
      access_token: token_data.fetch("access_token"),
      refresh_token: token_data.fetch("refresh_token"),
      expires_at: Time.at(token_data.fetch("expires_at")),
      athlete_id: athlete["id"],
      scope: params[:scope],
    )
    # Landing on the Strava page only makes sense for the "connect while
    # already signed in" path -- a fresh sign-in via Strava has nowhere
    # Strava-specific to go back to, so it lands on the home page instead.
    success_path = signed_in_user ? "/strava?connected=1" : "/"
    redirect_to Frontend.url(success_path), allow_other_host: true
  rescue Strava::Client::Error
    redirect_to Frontend.url("/strava?error=exchange_failed"), allow_other_host: true
  rescue ActiveRecord::RecordInvalid
    redirect_to Frontend.url("/strava?error=athlete_already_linked"), allow_other_host: true
  rescue Auth::ResolveIdentity::AlreadyLinkedToAnotherUser
    redirect_to Frontend.url("/strava?error=identity_already_linked"), allow_other_host: true
  end

  def status
    credential = current_user.strava_credential
    render json: {
      connected: credential.present?,
      athlete_id: credential&.athlete_id,
      last_synced_at: credential&.last_synced_at,
      last_full_sync_at: credential&.last_full_sync_at,
      full_sync_available_at: credential&.full_sync_available_at,
      full_sync_request_estimate: credential&.full_sync_request_estimate,
      max_bulk_resync: MAX_BULK_RESYNC,
      last_sync_failed_at: credential&.last_sync_failed_at,
      last_sync_error: credential&.last_sync_error,
      last_sync_failed_kind: credential&.last_sync_failed_kind,
      last_sync_retry_at: credential&.last_sync_retry_at,
    }
  end

  # POST /strava/sync -- full: true re-reads the user's entire Strava
  # history (and reconciles rides gone from Strava); without it, behavior
  # is unchanged. The cooldown only gates the full-refresh path -- an
  # incremental sync has no such limit.
  def sync
    if ActiveModel::Type::Boolean.new.cast(params[:full])
      credential = current_user.strava_credential

      if credential
        available_at = credential.full_sync_available_at
        return render json: { retry_at: available_at }, status: :too_many_requests if available_at

        credential.update!(full_sync_started_at: Time.current)
      end

      StravaSyncJob.perform_later(current_user.id, full_resync: true)
    else
      StravaSyncJob.perform_later(current_user.id)
    end

    head :accepted
  end

  def unmapped_gear
    gears = StravaGear.unmapped_for(current_user)
    activity_counts = current_user.strava_activities.group(:gear_id).count
    last_activity_dates = current_user.strava_activities.group(:gear_id).maximum(:moved_at)

    # Retired gear always sinks to the bottom; within each group, ascending
    # activity count surfaces true 0-activity new additions first.
    sorted = gears.sort_by { |g| [g.retired ? 1 : 0, activity_counts[g.strava_gear_id] || 0] }

    render json: sorted.map { |g| unmapped_gear_json(g, activity_counts, last_activity_dates) }
  end

  def ignored_gear
    gears = StravaGear.ignored_for(current_user)
    activity_counts = current_user.strava_activities.group(:gear_id).count
    last_activity_dates = current_user.strava_activities.group(:gear_id).maximum(:moved_at)

    sorted = gears.sort_by(&:ignored_at).reverse

    render json: sorted.map { |g|
      {
        gear_id: g.strava_gear_id, name: g.name, brand_name: g.brand_name,
        model_name: g.model, retired: g.retired,
        activity_count: activity_counts[g.strava_gear_id] || 0,
        distance_meters: g.distance_meters,
        last_activity_on: last_activity_dates[g.strava_gear_id]&.to_date,
        ignored_at: g.ignored_at,
      }
    }
  end

  def ignore_gear
    gear = current_user.strava_gears.find_by!(strava_gear_id: params[:gear_id])

    if gear.update(ignored_at: Time.current)
      head :no_content
    else
      render json: gear.errors, status: :unprocessable_content
    end
  end

  def unignore_gear
    gear = current_user.strava_gears.find_by!(strava_gear_id: params[:gear_id])
    gear.update!(ignored_at: nil)
    head :no_content
  end

  def refresh_gear
    Strava::GearSync.new(current_user).call
    head :no_content
  end

  def mapped_gear
    bikes = current_user.bikes.where.not(strava_gear_id: [nil, ""])
    gear_by_id = current_user.strava_gears.index_by(&:strava_gear_id)

    # Active gear before retired (same "retired sinks to the bottom"
    # convention as unmapped_gear's sort), alphabetical by bike name within
    # each group. "Retired" here is the Strava-reported gear flag, not
    # Bike#retired_on -- the same field this row already displays.
    sorted = bikes.sort_by { |bike| [gear_by_id[bike.strava_gear_id]&.retired ? 1 : 0, bike.name] }

    render json: sorted.map { |bike|
      gear = gear_by_id[bike.strava_gear_id]
      {
        bike_id: bike.id, bike_name: bike.name, gear_id: bike.strava_gear_id,
        name: gear&.name, brand_name: gear&.brand_name, model_name: gear&.model,
        retired: gear&.retired || false,
        activity_count: bike.strava_activities.count,
        distance_meters: bike.strava_activities.sum(:distance_meters),
      }
    }
  end

  def reassign_gear
    gear_id = params[:gear_id]
    current_bike = current_user.bikes.find_by(strava_gear_id: gear_id)

    if params[:bike_id].present?
      target_bike = current_user.bikes.find(params[:bike_id])
      if target_bike.strava_gear_id.present? && target_bike.strava_gear_id != gear_id
        return render json: { base: ["Bike is already mapped to a different gear"] },
          status: :unprocessable_content
      end

      ActiveRecord::Base.transaction do
        current_bike&.update!(strava_gear_id: nil) if current_bike != target_bike
        target_bike.update!(strava_gear_id: gear_id)
      end
    else
      current_bike&.update!(strava_gear_id: nil)
    end

    head :no_content
  end

  # GET /strava/rides
  def rides
    result = Strava::RideLog.call(
      current_user,
      status: params[:status], bike_id: params[:bike_id],
      sort: params[:sort], order: params[:order],
      page: params[:page], per_page: params[:per_page],
    )

    render json: { rides: rides_json(result.rides), meta: rides_meta_json(result) }
  end

  # POST /strava/rides/ignore -- { activity_ids: [...] } or
  # { all_matching: true, status: "attention" }. Ineligible ids (attributed,
  # already ignored, or another user's) are silently skipped, not a 422 --
  # the response's count is itself the signal, consistent with this
  # feature's no-confirm-modal, fully reversible design.
  def ignore_rides
    scope = if ActiveModel::Type::Boolean.new.cast(params[:all_matching])
      StravaActivity.needs_attention_for(current_user)
    else
      current_user.strava_activities.where(id: Array(params[:activity_ids]), bike_id: nil, ignored_at: nil)
    end

    ignored_count = scope.update_all(ignored_at: Time.current)
    render json: { ignored_count: ignored_count }
  end

  # POST /strava/rides/unignore -- only ever clears a ride's own ignored_at,
  # never a gear-level ignore (a gear-ignored ride has no ignored_at of its
  # own to clear, so it's naturally excluded by this scope).
  def unignore_rides
    unignored_count = current_user.strava_activities
      .where(id: Array(params[:activity_ids])).where.not(ignored_at: nil)
      .update_all(ignored_at: nil)

    render json: { unignored_count: unignored_count }
  end

  # POST /strava/rides/:id/resync -- re-fetches one activity from Strava and
  # re-applies attribution via the same Strava::ActivityUpsert path the sync
  # job uses, without touching last_synced_at/last_full_sync_at or running
  # the full Strava::GearSync -- this is a standalone one-ride action, not a
  # sync cycle. A 404 from Strava, or a type that's since changed to
  # something StravaSyncJob::SYNCED_TYPES excludes, is treated the same way
  # full-refresh reconciliation already treats it: indistinguishable from
  # deleted, so the local row is removed. A successful resync also backfills
  # StravaGear for its gear_id if the cache doesn't have it yet (a bike added
  # on Strava since the last sync) -- see sync_uncached_gear.
  def resync_ride
    activity = current_user.strava_activities.find(params[:id])
    credential = current_user.strava_credential
    return render json: { base: ["Strava is not connected"] }, status: :unprocessable_content if credential.nil?

    access_token = credential.ensure_fresh_access_token!
    resynced = resync_one(activity, access_token, Strava::Client.new)
    sync_uncached_gear([activity.gear_id]) if resynced
    render json: { deleted: !resynced }
  rescue Strava::Client::RateLimitedError => e
    render json: { base: ["Strava's rate limit was reached"], retry_at: e.retry_at }, status: :too_many_requests
  rescue Strava::Client::Error
    render json: { base: ["Strava request failed -- try again shortly"] }, status: :bad_gateway
  end

  # POST /strava/rides/resync -- { activity_ids: [...] }, the bulk companion
  # to the per-row action above, backing the Rides tab's "Needs attention"
  # selection toolbar's "Resync selected". Deliberately doesn't support
  # all_matching the way ignore_rides does -- that could mean an unbounded
  # number of synchronous Strava calls in one request, unlike ignore's
  # single update_all; MAX_BULK_RESYNC is a hard cap on the explicit id list
  # (422 above it, not a silent truncation) for the same reason -- the
  # frontend's own threshold routing to a full refresh means a real request
  # should never hit it. Refreshes the access token once up front rather
  # than once per row. One row's ordinary Strava::Client::Error (5xx/
  # timeout) is counted as a failure, not aborting the rest of the batch --
  # partial progress beats an all-or-nothing retry on a transient blip. A
  # RateLimitedError is different: every remaining call would fail too and
  # still count against the daily limit, so it stops the batch instead,
  # reporting how much was never attempted.
  def resync_rides
    credential = current_user.strava_credential
    return render json: { base: ["Strava is not connected"] }, status: :unprocessable_content if credential.nil?

    ids = Array(params[:activity_ids])
    if ids.size > MAX_BULK_RESYNC
      return render json: { base: ["At most #{MAX_BULK_RESYNC} rides can be resynced at once"] },
        status: :unprocessable_content
    end

    access_token = credential.ensure_fresh_access_token!
    client = Strava::Client.new
    # Preserve the requested order (not whatever order the DB happens to
    # return) -- not_attempted_count/which rows got processed before a rate
    # limit stopped the batch should match what the caller actually sent.
    # Ids that aren't this user's own are silently dropped, same convention
    # as every other bulk action here.
    by_id = current_user.strava_activities.where(id: ids).index_by(&:id)
    activities = ids.filter_map { |id| by_id[id.to_i] }

    resynced_count = 0
    deleted_count = 0
    failed_count = 0
    not_attempted_count = nil
    retry_at = nil
    new_gear_ids = Set.new

    activities.each_with_index do |activity, index|
      begin
        if resync_one(activity, access_token, client)
          resynced_count += 1
          new_gear_ids << activity.gear_id if activity.gear_id.present?
        else
          deleted_count += 1
        end
      rescue Strava::Client::RateLimitedError => e
        retry_at = e.retry_at
        not_attempted_count = activities.size - index
        break
      rescue Strava::Client::Error
        failed_count += 1
      end
    end

    sync_uncached_gear(new_gear_ids.to_a)

    response = { resynced_count: resynced_count, deleted_count: deleted_count, failed_count: failed_count }
    if retry_at
      response[:not_attempted_count] = not_attempted_count
      response[:retry_at] = retry_at
    end
    render json: response
  end

  private

  # Fetches and caches StravaGear for any gear id not already known for this
  # user -- resync_ride/resync_rides skip the full Strava::GearSync (which
  # also hits GET /athlete and every other already-known id), so without
  # this a ride that picks up a brand-new gear id would leave the Rides
  # tab's Gear column blank, the Gear tab not listing it, and "Resolve gear"
  # leading nowhere, until the next full/incremental sync. One fetch per
  # distinct new gear id, not per ride -- GearSync#sync_gear's own rescue
  # already skips silently on failure (including a 429), so this can't fail
  # the ride resync it's called after.
  def sync_uncached_gear(gear_ids)
    gear_ids = gear_ids.compact.uniq
    return if gear_ids.empty?

    cached = current_user.strava_gears.where(strava_gear_id: gear_ids).pluck(:strava_gear_id)
    missing = gear_ids - cached
    return if missing.empty?

    gear_sync = Strava::GearSync.new(current_user)
    missing.each { |gear_id| gear_sync.sync_gear(gear_id) }
  end

  # Returns true when the activity was resynced, false when it was deleted
  # (a 404 from Strava, or a type StravaSyncJob::SYNCED_TYPES now excludes --
  # the same "indistinguishable from deleted" rule full-refresh
  # reconciliation already uses). Any other Strava::Client::Error propagates
  # to the caller, which decides how to respond (502 for the single-row
  # action, a per-row failed count for the bulk one).
  def resync_one(activity, access_token, client)
    raw = client.fetch_activity(activity.strava_id, access_token: access_token)

    if StravaSyncJob::SYNCED_TYPES.include?(raw["type"])
      bike = current_user.bikes.find_by(strava_gear_id: raw["gear_id"])
      Strava::ActivityUpsert.call(user: current_user, activity: activity, raw: raw, bike: bike)
      true
    else
      activity.destroy
      false
    end
  rescue Strava::Client::NotFoundError
    activity.destroy
    false
  end

  def rides_json(rides)
    ignored_gear_ids = StravaGear.ignored_for(current_user).pluck(:strava_gear_id)
    bikes_by_id = Bike.where(id: rides.map(&:bike_id).compact).index_by(&:id)
    gears_by_id = current_user.strava_gears.where(strava_gear_id: rides.map(&:gear_id).compact).index_by(&:strava_gear_id)
    counted_toward = Maintenance::CountedTowardQuery.call(current_user, activity_ids: rides.map(&:id))

    rides.map do |ride|
      bike = ride.bike_id && bikes_by_id[ride.bike_id]
      gear = ride.gear_id && gears_by_id[ride.gear_id]

      Strava::RideSerialization.base_json(ride).merge(
        bike: bike && { id: bike.id, name: bike.name },
        gear: gear && { strava_gear_id: gear.strava_gear_id, name: gear.name },
        attribution: ride.attribution_status(ignored_gear_ids),
        reason: ride.reason(ignored_gear_ids),
        ignored_at: ride.ignored_at,
        counted_toward: counted_toward[ride.id] || [],
      )
    end
  end

  def rides_meta_json(result)
    {
      total_count: result.total_count,
      total_distance_meters: result.total_distance_meters,
      page: result.page,
      per_page: result.per_page,
      next_page: result.next_page,
      status_counts: result.status_counts,
    }
  end

  def unmapped_gear_json(gear, activity_counts, last_activity_dates)
    {
      gear_id: gear.strava_gear_id, name: gear.name, brand_name: gear.brand_name,
      model_name: gear.model, retired: gear.retired,
      activity_count: activity_counts[gear.strava_gear_id] || 0,
      distance_meters: gear.distance_meters,
      last_activity_on: last_activity_dates[gear.strava_gear_id]&.to_date,
      # Only possible for a row that passed StravaGear.unmapped_for's own
      # filter while still ignored -- that filter already requires a
      # resurfacing activity in that case, so this is never a stale flag.
      resurfaced: gear.ignored_at.present?,
    }
  end

  def strava_authorize_url
    creds = Rails.application.credentials.strava
    query = {
      client_id: creds[:client_id],
      redirect_uri: strava_callback_url,
      response_type: "code",
      scope: "activity:read_all,profile:read_all",
      approval_prompt: "auto",
      state: session[:strava_oauth_state],
    }.to_query
    "https://www.strava.com/oauth/authorize?#{query}"
  end
end
