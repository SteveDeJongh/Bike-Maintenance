module Strava
  # The one shared ride-attribute list and base JSON shape for both
  # BikesController#rides (one bike's Ride history) and
  # StravaController#rides (the cross-bike Rides tab) -- each caller merges
  # its own extra fields (cumulative_distance_meters for the former;
  # bike/gear/attribution/reason/ignored_at/counted_toward for the latter)
  # on top of this.
  module RideSerialization
    ATTRIBUTES = %i[
      id strava_id name moved_at activity_type commute
      distance_meters moving_time elapsed_time total_elevation_gain
      average_speed max_speed average_watts weighted_average_watts device_watts
      kilojoules average_heartrate max_heartrate average_cadence
    ].freeze

    def self.base_json(ride)
      ride.as_json(only: ATTRIBUTES).merge(ride_kind: ride.ride_kind)
    end
  end
end
