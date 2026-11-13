module Maintenance
  # The batched replacement for looping per-assignment through
  # ComponentAssignment#activities_from -- one SQL query for a whole user's
  # enabled ComponentServiceRequirements instead of one Ruby query per
  # assignment.
  #
  # This is the increment-1 version: every requirement at this point still
  # has exactly one satisfier (position 1, from the data migration) and
  # only ever a distance and/or day-based calendar threshold, so it reads
  # "the" baseline the same way the old single-service-type interval did.
  # Maintenance::BatchedPositionQuery (increment 2) replaces this with the
  # real multi-satisfier, three-dimension version.
  class BatchedDistanceQuery
    IntervalDistance = Struct.new(:distance_meters, :baseline_at, keyword_init: true)

    # Returns { component_service_requirement_id => IntervalDistance } for
    # every ComponentServiceRequirement belonging to the given user, enabled
    # or not -- enabled-only filtering happens one layer up, in
    # Maintenance::IntervalStatus.for_user (eligibility/banners/table
    # columns); IntervalStatus.for_component (the component detail page)
    # wants every requirement's distance, including a disabled one's, so its
    # status is still meaningful if it gets re-enabled.
    def self.call(user)
      sql = <<~SQL
        WITH requirement_service_types AS (
          -- "The" service type for each requirement, at position 1 of
          -- whichever owner's satisfiers actually apply (the template's,
          -- for a linked row).
          SELECT csr.id AS component_service_requirement_id, csr.component_id, s.service_type_id
          FROM component_service_requirements csr
          JOIN components ON components.id = csr.component_id
          LEFT JOIN service_requirement_satisfiers s
            ON s.position = 1
            AND (
              (csr.category_service_requirement_id IS NOT NULL
                AND s.owner_type = 'CategoryServiceRequirement' AND s.owner_id = csr.category_service_requirement_id)
              OR (csr.category_service_requirement_id IS NULL
                AND s.owner_type = 'ComponentServiceRequirement' AND s.owner_id = csr.id)
            )
          WHERE components.user_id = #{user.id.to_i}
        ),
        baselines AS (
          SELECT
            rst.component_service_requirement_id,
            rst.component_id,
            COALESCE(
              (SELECT MAX(me.performed_at) FROM maintenance_events me
                WHERE me.component_id = rst.component_id AND me.service_type_id = rst.service_type_id),
              (SELECT MIN(ca.started_at) FROM component_assignments ca WHERE ca.component_id = rst.component_id),
              (SELECT c.acquired_on::timestamp FROM components c WHERE c.id = rst.component_id)
            ) AS baseline_at
          FROM requirement_service_types rst
        )
        SELECT
          b.component_service_requirement_id,
          b.baseline_at,
          COALESCE(SUM(sa.distance_meters), 0) AS distance_meters
        FROM baselines b
        LEFT JOIN component_assignments ca ON ca.component_id = b.component_id
        LEFT JOIN strava_activities sa ON sa.bike_id = ca.bike_id
          AND sa.moved_at >= GREATEST(ca.started_at, b.baseline_at)
          AND (ca.ended_at IS NULL OR sa.moved_at < ca.ended_at)
          AND #{RideContextSql.predicate(assignment_alias: "ca", activity_alias: "sa")}
        GROUP BY b.component_service_requirement_id, b.baseline_at
      SQL

      result = ActiveRecord::Base.connection.exec_query(sql)

      result.to_a.each_with_object({}) do |row, hash|
        baseline_at = row["baseline_at"]
        baseline_at = Time.zone.parse(baseline_at) if baseline_at.is_a?(String)

        hash[row["component_service_requirement_id"].to_i] = IntervalDistance.new(
          distance_meters: row["distance_meters"].to_i,
          baseline_at: baseline_at,
        )
      end
    end
  end
end
