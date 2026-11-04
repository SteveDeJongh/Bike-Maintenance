module Maintenance
  # The one shared SQL fragment for ride_context filtering between a
  # component_assignments row and a strava_activities row -- kept bit-for-bit
  # equivalent to ComponentAssignment#activities_from's Ruby-level semantics
  # (StravaActivity.indoor/#outdoor), proven by BatchedDistanceQuery's parity
  # specs and CountedTowardQuery's. Extracted so BatchedDistanceQuery and any
  # other batched query joining the same two tables can never drift apart on
  # this logic. IS DISTINCT FROM (not Rails' NULL-unsafe-looking but actually
  # NULL-safe where.not) is deliberate -- matches StravaActivity.outdoor
  # excluding only true "VirtualRide" rows, never silently dropping a NULL
  # activity_type row too.
  module RideContextSql
    def self.predicate(assignment_alias:, activity_alias:)
      <<~SQL.strip
        (
          #{assignment_alias}.ride_context = 'both'
          OR (#{assignment_alias}.ride_context = 'outdoor_only' AND #{activity_alias}.trainer = false AND #{activity_alias}.activity_type IS DISTINCT FROM 'VirtualRide')
          OR (#{assignment_alias}.ride_context = 'indoor_only' AND (#{activity_alias}.trainer = true OR #{activity_alias}.activity_type = 'VirtualRide'))
        )
      SQL
    end
  end
end
