class StravaSyncJob < ApplicationJob
  queue_as :default

  MAX_PAGES = 50

  def perform(user_id)
    user = User.find(user_id)
    credential = user.strava_credential
    return if credential.nil?

    access_token = credential.ensure_fresh_access_token!
    after = user.strava_activities.maximum(:moved_at)&.to_i
    client = Strava::Client.new
    page = 1

    loop do
      break if page > MAX_PAGES

      activities = client.fetch_activities(access_token: access_token, after: after, page: page, per_page: 100)
      break if activities.empty?

      activities.each { |raw| upsert_activity(user, raw) }
      page += 1
    end

    Strava::GearSync.new(user).call
  end

  private

  def upsert_activity(user, raw)
    return unless raw["type"] == "Ride"

    activity = StravaActivity.find_or_initialize_by(strava_id: raw["id"])
    activity.update!(
      user: user,
      name: raw["name"],
      distance_meters: raw["distance"].to_i,
      moved_at: raw["start_date"],
      activity_type: raw["sport_type"],
      gear_id: raw["gear_id"],
      bike_id: user.bikes.find_by(strava_gear_id: raw["gear_id"])&.id,
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
    )
  end
end
