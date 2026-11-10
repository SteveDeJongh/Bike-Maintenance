module Strava
  # The one place a raw Strava activity payload gets written onto a
  # StravaActivity row -- shared by StravaSyncJob (which resolves `activity`/
  # `bike` from hashes it preloads once per sync) and StravaController#resync_ride
  # (which resolves them for a single row), so attribution/ignored_at rules
  # can never drift between the two call sites.
  module ActivityUpsert
    def self.call(user:, activity:, raw:, bike:)
      attrs = {
        user: user,
        name: raw["name"],
        distance_meters: raw["distance"].to_i,
        moved_at: raw["start_date"],
        activity_type: raw["sport_type"],
        gear_id: raw["gear_id"],
        bike_id: bike&.id,
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
      # re-attributing write raise RecordInvalid against that validation
      # instead of resolving cleanly. Omitted entirely (not just false-y) when
      # still unattributed, so a manual ignore is never touched.
      attrs[:ignored_at] = nil if bike.present?

      activity.update!(attrs)
    end
  end
end
