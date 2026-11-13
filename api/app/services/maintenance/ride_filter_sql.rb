module Maintenance
  # The SQL equivalent of a ComponentServiceRequirement's effective
  # ride_filter ("all"/"outdoor"/"indoor") -- a narrower filter layered on
  # top of a component assignment's own ride_context (RideContextSql), never
  # wider. Reuses RideContextSql's own indoor/outdoor predicates rather than
  # redefining the indoor rule a second time, so StravaActivity#indoor?
  # stays the one place that rule is written.
  #
  # requirement_alias must expose a `ride_filter` text column -- a real
  # table's column, or (as BatchedPositionQuery uses it) a VALUES-list CTE
  # column carrying each checkpoint's own resolved ride_filter value.
  module RideFilterSql
    def self.predicate(requirement_alias:, activity_alias:)
      <<~SQL.strip
        (
          #{requirement_alias}.ride_filter = 'all'
          OR (#{requirement_alias}.ride_filter = 'outdoor' AND #{RideContextSql.outdoor_predicate(activity_alias: activity_alias)})
          OR (#{requirement_alias}.ride_filter = 'indoor' AND #{RideContextSql.indoor_predicate(activity_alias: activity_alias)})
        )
      SQL
    end
  end
end
