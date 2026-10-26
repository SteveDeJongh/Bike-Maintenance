module Maintenance
  # The batched replacement for looping per-assignment through
  # ComponentAssignment#activities_from -- one SQL query for a whole user's
  # enabled ComponentServiceIntervals instead of one Ruby query per
  # assignment. The ride_context filtering here is the exact same semantics
  # as StravaActivity#indoor/#outdoor and ComponentAssignment#activities_from,
  # just inlined into SQL for a single batched pass. See CLAUDE.md's
  # Component#total_distance note about why this exists.
  class BatchedDistanceQuery
    IntervalDistance = Struct.new(:distance_meters, :baseline_at, keyword_init: true)

    # Returns { component_service_interval_id => IntervalDistance } for
    # every enabled ComponentServiceInterval belonging to the given user.
    def self.call(user)
      sql = <<~SQL
        WITH baselines AS (
          SELECT
            csi.id AS component_service_interval_id,
            csi.component_id,
            COALESCE(
              (SELECT MAX(me.performed_at) FROM maintenance_events me
                WHERE me.component_id = csi.component_id AND me.service_type_id = csi.service_type_id),
              (SELECT MIN(ca.started_at) FROM component_assignments ca WHERE ca.component_id = csi.component_id),
              (SELECT c.acquired_on::timestamp FROM components c WHERE c.id = csi.component_id)
            ) AS baseline_at
          FROM component_service_intervals csi
          JOIN components ON components.id = csi.component_id
          WHERE csi.enabled = true AND components.user_id = #{user.id.to_i}
        )
        SELECT
          b.component_service_interval_id,
          b.baseline_at,
          COALESCE(SUM(sa.distance_meters), 0) AS distance_meters
        FROM baselines b
        LEFT JOIN component_assignments ca ON ca.component_id = b.component_id
        LEFT JOIN strava_activities sa ON sa.bike_id = ca.bike_id
          AND sa.moved_at >= GREATEST(ca.started_at, b.baseline_at)
          AND (ca.ended_at IS NULL OR sa.moved_at < ca.ended_at)
          AND (
            ca.ride_context = 'both'
            OR (ca.ride_context = 'outdoor_only' AND sa.trainer = false AND sa.activity_type IS DISTINCT FROM 'VirtualRide')
            OR (ca.ride_context = 'indoor_only' AND (sa.trainer = true OR sa.activity_type = 'VirtualRide'))
          )
        GROUP BY b.component_service_interval_id, b.baseline_at
      SQL

      result = ActiveRecord::Base.connection.exec_query(sql)

      result.to_a.each_with_object({}) do |row, hash|
        baseline_at = row["baseline_at"]
        baseline_at = Time.zone.parse(baseline_at) if baseline_at.is_a?(String)

        hash[row["component_service_interval_id"].to_i] = IntervalDistance.new(
          distance_meters: row["distance_meters"].to_i,
          baseline_at: baseline_at,
        )
      end
    end
  end
end
