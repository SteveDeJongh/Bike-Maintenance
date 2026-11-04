class StravaController < ApplicationController
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
    render json: { connected: credential.present?, athlete_id: credential&.athlete_id }
  end

  def sync
    StravaSyncJob.perform_later(current_user.id)
    head :accepted
  end

  def unmapped_gear
    mapped_ids = current_user.bikes.where.not(strava_gear_id: [nil, ""]).pluck(:strava_gear_id)
    gears = current_user.strava_gears.where.not(strava_gear_id: mapped_ids)
    activity_counts = current_user.strava_activities.group(:gear_id).count

    # Retired gear always sinks to the bottom; within each group, ascending
    # activity count surfaces true 0-activity new additions first.
    sorted = gears.sort_by { |g| [g.retired ? 1 : 0, activity_counts[g.strava_gear_id] || 0] }

    render json: sorted.map { |g|
      {
        gear_id: g.strava_gear_id, name: g.name, brand_name: g.brand_name,
        model_name: g.model, retired: g.retired,
        activity_count: activity_counts[g.strava_gear_id] || 0,
        distance_meters: g.distance_meters,
      }
    }
  end

  def refresh_gear
    Strava::GearSync.new(current_user).call
    head :no_content
  end

  def mapped_gear
    bikes = current_user.bikes.where.not(strava_gear_id: [nil, ""]).order(:name)
    gear_by_id = current_user.strava_gears.index_by(&:strava_gear_id)

    render json: bikes.map { |bike|
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

  private

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
