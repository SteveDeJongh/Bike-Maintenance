module Maintenance
  # Batches "which components does each of these rides count toward" into
  # one query -- callers (Activity::Feed, BikesController#rides via
  # Bikes::RideHistory, StravaController#rides) pass one page's exact
  # activity ids, so looping per activity through
  # ComponentAssignment#activities_from (fine at component-detail scale, see
  # CLAUDE.md) isn't an N+1 across the page.
  class CountedTowardQuery
    # Returns { strava_activity_id => [{component_id:, label:}, ...] } for
    # every given activity of the user's. An activity with no entry counted
    # toward nothing (unattributed, or attributed to a bike with no matching
    # assignment).
    def self.call(user, activity_ids:)
      return {} if activity_ids.empty?

      conditions = [
        "sa.user_id = #{user.id.to_i}",
        "sa.id IN (#{Array(activity_ids).map(&:to_i).join(',')})",
      ]

      sql = <<~SQL
        SELECT sa.id AS strava_activity_id, c.id AS component_id, c.label AS component_label
        FROM strava_activities sa
        JOIN component_assignments ca ON ca.bike_id = sa.bike_id
          AND sa.moved_at >= ca.started_at
          AND (ca.ended_at IS NULL OR sa.moved_at < ca.ended_at)
          AND #{RideContextSql.predicate(assignment_alias: "ca", activity_alias: "sa")}
        JOIN components c ON c.id = ca.component_id
        WHERE #{conditions.join(' AND ')}
      SQL

      result = ActiveRecord::Base.connection.exec_query(sql)

      result.to_a.each_with_object(Hash.new { |h, k| h[k] = [] }) do |row, hash|
        hash[row["strava_activity_id"].to_i] << { component_id: row["component_id"].to_i, label: row["component_label"] }
      end
    end
  end
end
