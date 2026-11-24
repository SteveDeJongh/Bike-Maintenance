module Maintenance
  # Batched Component#total_distance: each component's lifetime distance
  # across every assignment window, on the bike it was mounted to, in one
  # grouped query rather than one per assignment. Same rules as
  # ComponentAssignment#activities_from -- half-open [started_at, ended_at)
  # windows and the assignment's ride_context (RideContextSql) -- with a
  # parity spec against the Ruby path.
  class LifetimeDistanceQuery
    # Returns { component_id => meters } for every given component of the
    # user's; components with no attributed distance map to 0.
    def self.call(user, component_ids:)
      ids = Array(component_ids).map(&:to_i).uniq
      return {} if ids.empty?

      sql = <<~SQL
        SELECT ca.component_id, COALESCE(SUM(sa.distance_meters), 0) AS meters
        FROM component_assignments ca
        JOIN components c ON c.id = ca.component_id AND c.user_id = #{user.id.to_i}
        JOIN strava_activities sa ON sa.bike_id = ca.bike_id
          AND sa.moved_at >= ca.started_at
          AND (ca.ended_at IS NULL OR sa.moved_at < ca.ended_at)
          AND #{RideContextSql.predicate(assignment_alias: "ca", activity_alias: "sa")}
        WHERE ca.component_id IN (#{ids.join(',')})
        GROUP BY ca.component_id
      SQL

      totals = ActiveRecord::Base.connection.exec_query(sql).to_a.to_h { |row| [ row["component_id"].to_i, row["meters"].to_i ] }
      owned = user.components.where(id: ids).pluck(:id)
      owned.to_h { |id| [ id, totals[id] || 0 ] }
    end
  end
end
