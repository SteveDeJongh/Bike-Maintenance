module Strava
  class GearSync
    def initialize(user)
      @user = user
      @client = Client.new
    end

    def call
      access_token = user.strava_credential.ensure_fresh_access_token!
      known_ids = athlete_bike_ids(access_token) | activity_gear_ids

      known_ids.each do |gear_id|
        upsert_gear(gear_id, access_token)
      end
    end

    # Fetches and upserts a single gear id -- used after a single/bulk ride
    # resync (StravaController) to backfill StravaGear for a gear id the
    # cache doesn't have yet (a bike added on Strava since the last sync),
    # without running the full #call (which also hits GET /athlete and every
    # other already-known gear id -- unnecessary just to pick up one new id).
    # upsert_gear's own rescue already skips silently on any Client::Error,
    # so a failed/rate-limited gear fetch here can't fail the caller.
    def sync_gear(gear_id)
      access_token = user.strava_credential.ensure_fresh_access_token!
      upsert_gear(gear_id, access_token)
    end

    private

    attr_reader :user, :client

    def athlete_bike_ids(access_token)
      athlete = client.fetch_athlete(access_token: access_token)
      Array(athlete["bikes"]).map { |bike| bike["id"] }
    rescue Client::Error
      []
    end

    def activity_gear_ids
      user.strava_activities.distinct.pluck(:gear_id).compact
    end

    def upsert_gear(gear_id, access_token)
      detail = client.fetch_gear(gear_id, access_token: access_token)
      gear = StravaGear.find_or_initialize_by(user: user, strava_gear_id: gear_id)
      gear.update!(
        name: detail["name"],
        brand_name: detail["brand_name"],
        model: detail["model_name"],
        retired: detail["retired"] || false,
        distance_meters: detail["distance"],
        synced_at: Time.current,
      )
    rescue Client::Error
      nil # skip this one gear id, don't abort the rest of the refresh
    end
  end
end
