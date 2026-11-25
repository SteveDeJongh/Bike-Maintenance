module Components
  # One component's whole life for its page (GET /components/:id): every
  # installation with its stint distance, the lifetime totals, and its
  # maintenance events with the component's lifetime distance at each one.
  # Batched -- one grouped query per piece, never one per assignment or
  # event -- with the same rules as ComponentAssignment#activities_from:
  # half-open [started_at, ended_at) windows on the assignment's bike, and
  # its ride_context through the shared RideContextSql predicate. A parity
  # spec checks the totals against Component's and ComponentAssignment's
  # own Ruby methods.
  class LifeHistory
    Result = Struct.new(:assignments, :lifetime_stats, :maintenance_events, keyword_init: true)

    def self.call(component)
      new(component).call
    end

    def initialize(component)
      @component = component
    end

    def call
      stats = assignment_stats
      Result.new(
        assignments: assignments_json(stats),
        lifetime_stats: lifetime_stats(stats.values),
        maintenance_events: maintenance_events_json,
      )
    end

    private

    attr_reader :component

    def connection
      ActiveRecord::Base.connection
    end

    def context_predicate
      Maintenance::RideContextSql.predicate(assignment_alias: "ca", activity_alias: "sa")
    end

    # { assignment_id => { distance:, moving_time:, elevation:, watts_sum:, watts_count: } }
    def assignment_stats
      sql = <<~SQL
        SELECT ca.id AS assignment_id,
               COALESCE(SUM(sa.distance_meters), 0) AS distance,
               COALESCE(SUM(sa.moving_time), 0) AS moving_time,
               COALESCE(SUM(sa.total_elevation_gain), 0) AS elevation,
               COALESCE(SUM(sa.average_watts) FILTER (WHERE sa.device_watts), 0) AS watts_sum,
               COUNT(sa.average_watts) FILTER (WHERE sa.device_watts) AS watts_count
        FROM component_assignments ca
        LEFT JOIN strava_activities sa ON sa.bike_id = ca.bike_id
          AND sa.moved_at >= ca.started_at
          AND (ca.ended_at IS NULL OR sa.moved_at < ca.ended_at)
          AND #{context_predicate}
        WHERE ca.component_id = #{component.id.to_i}
        GROUP BY ca.id
      SQL

      connection.exec_query(sql).to_a.to_h do |row|
        [
          row["assignment_id"].to_i,
          {
            distance: row["distance"].to_i,
            moving_time: row["moving_time"].to_i,
            elevation: row["elevation"].to_f,
            watts_sum: row["watts_sum"].to_f,
            watts_count: row["watts_count"].to_i,
          },
        ]
      end
    end

    def assignments_json(stats)
      component.component_assignments.includes(:bike).order(started_at: :desc, id: :desc).map do |assignment|
        {
          id: assignment.id,
          bike: { id: assignment.bike.id, name: assignment.bike.name },
          started_at: assignment.started_at,
          ended_at: assignment.ended_at,
          ride_context: assignment.ride_context,
          distance_meters: stats.dig(assignment.id, :distance) || 0,
        }
      end
    end

    # Power pools the metered rides across every stint, rather than
    # averaging each stint's average (Component#average_power's rule) --
    # safe to sum because one component's windows never cover the same ride.
    def lifetime_stats(rows)
      watts_count = rows.sum { |r| r[:watts_count] }
      {
        distance_meters: rows.sum { |r| r[:distance] },
        moving_time_seconds: rows.sum { |r| r[:moving_time] },
        elevation_gain_meters: rows.sum { |r| r[:elevation] },
        average_power: watts_count.zero? ? nil : (rows.sum { |r| r[:watts_sum] } / watts_count).round,
      }
    end

    # Newest first. component_distance_at_event_meters: attributed ride
    # distance with moved_at strictly before performed_at, across every
    # assignment (Maintenance::EventDistanceQuery). mounted_at_event: an
    # assignment covered performed_at.
    # session_components: the other components logged in the same
    # ServiceSession.
    def maintenance_events_json
      events = component.maintenance_events.includes(:service_type).order(performed_at: :desc, id: :desc).to_a
      return [] if events.empty?

      distances = Maintenance::EventDistanceQuery.call(component.user, event_ids: events.map(&:id))
      mounted = mounted_at_events
      sessions = session_components(events.filter_map(&:service_session_id).uniq)

      events.map do |event|
        {
          id: event.id,
          component_id: event.component_id,
          service_type_id: event.service_type_id,
          service_type_name: event.service_type.name,
          performed_at: event.performed_at,
          notes: event.notes,
          service_session_id: event.service_session_id,
          component_distance_at_event_meters: distances[event.id] || 0,
          mounted_at_event: mounted.include?(event.id),
          session_components: event.service_session_id ? sessions.fetch(event.service_session_id, []) : [],
        }
      end
    end

    def mounted_at_events
      component.maintenance_events
        .where(
          "EXISTS (SELECT 1 FROM component_assignments ca WHERE ca.component_id = maintenance_events.component_id " \
          "AND ca.started_at <= maintenance_events.performed_at " \
          "AND (ca.ended_at IS NULL OR maintenance_events.performed_at < ca.ended_at))",
        )
        .pluck(:id).to_set
    end

    # { session_id => [{id:, label:}, ...] }, this component left out.
    def session_components(session_ids)
      return {} if session_ids.empty?

      MaintenanceEvent.joins(:component)
        .where(service_session_id: session_ids).where.not(component_id: component.id)
        .where(components: { user_id: component.user_id })
        .order("components.label")
        .distinct
        .pluck(:service_session_id, "components.id", "components.label")
        .each_with_object(Hash.new { |h, k| h[k] = [] }) do |(session_id, id, label), hash|
          hash[session_id] << { id: id, label: label }
        end
    end
  end
end
