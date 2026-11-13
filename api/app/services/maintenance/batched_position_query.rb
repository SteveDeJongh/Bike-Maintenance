module Maintenance
  # Batches "what was this requirement's cumulative distance/moving-time
  # position at every candidate setting event, and now" across a whole
  # user's ComponentServiceRequirements in one SQL pass -- the real,
  # multi-satisfier replacement for the increment-1 BatchedDistanceQuery
  # shim, which only ever read a single satisfier's baseline.
  #
  # "Position" here is a lifetime, absolute number line value (cumulative
  # ride-filtered distance/moving-time since the component's first
  # assignment), never reset at a baseline -- Maintenance::RequirementStatus
  # needs every candidate event's position on the SAME number line to take
  # a max over (position + allowance) across them. The calendar dimension
  # needs no SQL position at all (its "position" is just the event's own
  # date) -- only distance/moving_time go through this query.
  #
  # Bounding: any candidate event strictly before the most recent
  # occurrence of the satisfier with the LARGEST resolved allowance on a
  # given dimension is provably dominated (its own due point, position +
  # its own allowance, can never exceed that satisfier's), so it can never
  # be the max -- excluded from the checkpoint list entirely rather than
  # paying for its position. A requirement with both distance and
  # moving_time active uses one shared cutoff (the earliest of the two
  # dimensions' own bounds) rather than two independent ones -- a
  # deliberate simplification; at worst a few extra, harmless checkpoints.
  class BatchedPositionQuery
    # events: every MaintenanceEvent on this requirement's component whose
    # service_type is one of the requirement's effective satisfiers,
    # ascending by performed_at -- the FULL, unbounded list (calendar needs
    # every one of them; only #positions is bounding-restricted).
    # positions: { event_id => {distance:, moving_time:}, :now => {...} } --
    # present only for checkpoints this query actually computed (an event
    # excluded by bounding simply has no entry, and RequirementStatus skips
    # it for the numeric dimensions accordingly).
    Bundle = Struct.new(:baseline_at, :events, :positions, keyword_init: true)

    def self.call(user)
      component_ids = user.components.ids
      return {} if component_ids.empty?

      requirements = ComponentServiceRequirement
        .joins(:component)
        .where(components: { id: component_ids })
        .includes(:component, category_service_requirement: { satisfiers: :service_type }, satisfiers: :service_type)
      return {} if requirements.empty?

      # One cheap aggregate query for the bounding step below -- the most
      # recent occurrence of every (component, service_type) pair.
      last_event_by_component_and_type = MaintenanceEvent.where(component_id: component_ids)
        .group(:component_id, :service_type_id).maximum(:performed_at)

      all_satisfier_type_ids = requirements.flat_map { |r| r.effective[:satisfiers].map { |s| s[:service_type_id] } }.uniq
      events_by_component_and_type = MaintenanceEvent
        .where(component_id: component_ids, service_type_id: all_satisfier_type_ids)
        .order(:performed_at)
        .group_by { |event| [event.component_id, event.service_type_id] }

      checkpoints = []
      bundle_data = {}

      requirements.each do |requirement|
        effective = requirement.effective
        component = requirement.component
        satisfier_ids = effective[:satisfiers].map { |s| s[:service_type_id] }
        events = satisfier_ids.flat_map { |sid| events_by_component_and_type[[component.id, sid]] || [] }.sort_by(&:performed_at)
        baseline_at = component.component_assignments.minimum(:started_at) || component.acquired_on

        bundle_data[requirement.id] = { baseline_at: baseline_at, events: events }

        needs_numeric = effective[:distance_meters].present? || effective[:moving_time_seconds].present?
        next unless needs_numeric

        cutoff = requirement_cutoff(effective, last_event_by_component_and_type, component.id)
        bounded_events = cutoff.nil? ? events : events.select { |event| event.performed_at >= cutoff }

        (bounded_events + [:now]).each do |candidate|
          checkpoints << {
            requirement_id: requirement.id, component_id: component.id, ride_filter: effective[:ride_filter],
            label: candidate == :now ? "now" : candidate.id.to_s,
            checkpoint_at: candidate == :now ? Time.current : candidate.performed_at,
          }
        end
      end

      positions = checkpoints.empty? ? {} : compute_positions(checkpoints)

      bundle_data.each_with_object({}) do |(requirement_id, data), hash|
        hash[requirement_id] = Bundle.new(
          baseline_at: data[:baseline_at], events: data[:events], positions: positions[requirement_id] || {},
        )
      end
    end

    # The earliest of the active numeric dimensions' own bounds -- nil
    # (meaning "no cutoff, every event is a candidate") if either active
    # dimension's own max-allowance satisfier has no occurrence yet.
    def self.requirement_cutoff(effective, last_event_by_component_and_type, component_id)
      bounds = []

      if effective[:distance_meters].present?
        bound = dimension_bound(effective[:satisfiers], :allowance_distance_meters, last_event_by_component_and_type, component_id)
        return nil if bound.nil?
        bounds << bound
      end

      if effective[:moving_time_seconds].present?
        bound = dimension_bound(effective[:satisfiers], :allowance_moving_time_seconds, last_event_by_component_and_type, component_id)
        return nil if bound.nil?
        bounds << bound
      end

      bounds.min
    end

    def self.dimension_bound(satisfiers, allowance_key, last_event_by_component_and_type, component_id)
      max_satisfier = satisfiers.max_by { |s| s[allowance_key] }
      last_event_by_component_and_type[[component_id, max_satisfier[:service_type_id]]]
    end
    private_class_method :dimension_bound

    # One SQL pass over exactly the needed (requirement, checkpoint) pairs,
    # via a small Ruby-built VALUES list -- the same
    # component_assignments ⨝ strava_activities join shape every other
    # batched query in this codebase already uses, parameterized by a list
    # of timestamps instead of one hardcoded "now". ride_filter rides along
    # on each VALUES row (not a join back to component_service_requirements)
    # since every checkpoint already knows its own requirement's effective
    # ride_filter from the Ruby side.
    def self.compute_positions(checkpoints)
      quote = ActiveRecord::Base.connection.method(:quote)
      values_sql = checkpoints.map do |cp|
        "(#{cp[:requirement_id]}, #{cp[:component_id]}, #{quote.call(cp[:ride_filter])}, " \
          "#{quote.call(cp[:label])}, #{quote.call(cp[:checkpoint_at])}::timestamp)"
      end.join(",\n")

      sql = <<~SQL
        WITH checkpoints (component_service_requirement_id, component_id, ride_filter, label, checkpoint_at) AS (
          VALUES #{values_sql}
        )
        SELECT
          cp.component_service_requirement_id,
          cp.label,
          COALESCE(SUM(sa.distance_meters), 0) AS distance_meters,
          COALESCE(SUM(sa.moving_time), 0) AS moving_time
        FROM checkpoints cp
        LEFT JOIN component_assignments ca ON ca.component_id = cp.component_id AND ca.started_at <= cp.checkpoint_at
        LEFT JOIN strava_activities sa ON sa.bike_id = ca.bike_id
          AND sa.moved_at >= ca.started_at
          AND sa.moved_at <= cp.checkpoint_at
          AND (ca.ended_at IS NULL OR sa.moved_at < ca.ended_at)
          AND #{RideContextSql.predicate(assignment_alias: "ca", activity_alias: "sa")}
          AND #{RideFilterSql.predicate(requirement_alias: "cp", activity_alias: "sa")}
        GROUP BY cp.component_service_requirement_id, cp.label
      SQL

      result = ActiveRecord::Base.connection.exec_query(sql)

      result.to_a.each_with_object(Hash.new { |h, k| h[k] = {} }) do |row, hash|
        requirement_id = row["component_service_requirement_id"].to_i
        label = row["label"] == "now" ? :now : row["label"].to_i
        hash[requirement_id][label] = { distance: row["distance_meters"].to_i, moving_time: row["moving_time"].to_i }
      end
    end
    private_class_method :compute_positions
  end
end
