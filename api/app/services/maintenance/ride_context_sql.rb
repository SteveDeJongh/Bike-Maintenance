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
          OR (#{assignment_alias}.ride_context = 'outdoor_only' AND #{outdoor_predicate(activity_alias: activity_alias)})
          OR (#{assignment_alias}.ride_context = 'indoor_only' AND #{indoor_predicate(activity_alias: activity_alias)})
        )
      SQL
    end

    # The SQL equivalent of StravaActivity.outdoor/.indoor, extracted out of
    # #predicate so a batched query filtering activities directly by
    # indoor/outdoor (not via a component_assignments row's ride_context,
    # e.g. Bikes::RideHistory's type filter) reuses the exact same rule
    # #predicate's own branches use, rather than a third copy.
    def self.outdoor_predicate(activity_alias:)
      "#{activity_alias}.trainer = false AND #{activity_alias}.activity_type IS DISTINCT FROM 'VirtualRide'"
    end

    def self.indoor_predicate(activity_alias:)
      "(#{activity_alias}.trainer = true OR #{activity_alias}.activity_type = 'VirtualRide')"
    end
  end
end
