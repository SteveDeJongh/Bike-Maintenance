class StravaController < ApplicationController
  def authorize
    redirect_to strava_authorize_url, allow_other_host: true
  end

  def callback
    if params[:error].present?
      return redirect_to "#{frontend_url}/strava?error=#{params[:error]}", allow_other_host: true
    end

    token_data = Strava::Client.new.exchange_code(params[:code])
    credential = current_user.strava_credential || current_user.build_strava_credential
    credential.update!(
      access_token: token_data.fetch("access_token"),
      refresh_token: token_data.fetch("refresh_token"),
      expires_at: Time.at(token_data.fetch("expires_at")),
      athlete_id: token_data.dig("athlete", "id"),
      scope: params[:scope],
    )
    redirect_to "#{frontend_url}/strava?connected=1", allow_other_host: true
  rescue Strava::Client::Error
    redirect_to "#{frontend_url}/strava?error=exchange_failed", allow_other_host: true
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
    render json: gears.map { |g|
      { gear_id: g.strava_gear_id, name: g.name, brand_name: g.brand_name,
        model_name: g.model, retired: g.retired }
    }
  end

  def refresh_gear
    Strava::GearSync.new(current_user).call
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
    }.to_query
    "https://www.strava.com/oauth/authorize?#{query}"
  end

  def frontend_url
    ENV.fetch("FRONTEND_URL", "http://localhost:5173")
  end
end
