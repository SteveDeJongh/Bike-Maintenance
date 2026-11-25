module Maintenance
  # Batched "the component's lifetime distance at this event": attributed
  # ride distance with moved_at strictly before the event's performed_at,
  # across every assignment window of the event's component, on the bike it
  # was mounted to, under the assignment's ride_context (RideContextSql).
  # One grouped query for any number of events -- the component page's
  # maintenance history and the Maintenance page's log both use it.
  class EventDistanceQuery
    # Returns { event_id => meters } for every given event of the user's;
    # events with no attributed distance map to 0.
    def self.call(user, event_ids:)
      ids = Array(event_ids).map(&:to_i).uniq
      return {} if ids.empty?

      sql = <<~SQL
        SELECT e.id AS event_id, COALESCE(SUM(sa.distance_meters), 0) AS meters
        FROM maintenance_events e
        JOIN components c ON c.id = e.component_id AND c.user_id = #{user.id.to_i}
        LEFT JOIN component_assignments ca ON ca.component_id = e.component_id
        LEFT JOIN strava_activities sa ON sa.bike_id = ca.bike_id
          AND sa.moved_at >= ca.started_at
          AND (ca.ended_at IS NULL OR sa.moved_at < ca.ended_at)
          AND sa.moved_at < e.performed_at
          AND #{RideContextSql.predicate(assignment_alias: 'ca', activity_alias: 'sa')}
        WHERE e.id IN (#{ids.join(',')})
        GROUP BY e.id
      SQL

      ActiveRecord::Base.connection.exec_query(sql).to_a.to_h { |row| [ row["event_id"].to_i, row["meters"].to_i ] }
    end
  end
end
