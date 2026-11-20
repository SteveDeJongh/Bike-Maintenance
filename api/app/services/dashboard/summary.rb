module Dashboard
  # Assembles the one GET /dashboard payload entirely from existing
  # services/queries -- no distance or status computation happens here that
  # doesn't already live in Maintenance::RequirementStatus/BatchedPositionQuery,
  # Component.current_bikes_by_component, or StravaGear.unmapped_for.
  class Summary
    def self.call(user, tz: nil)
      new(user, tz: tz).call
    end

    def initialize(user, tz: nil)
      @user = user
      @zone = (tz.present? && ActiveSupport::TimeZone[tz]) || Time.zone
    end

    # A plain rolling 14-day window, not calendar-day sensitive, so (unlike
    # distance_this_month) it doesn't need the viewer's tz at all.
    RECENT_RIDES_WINDOW = 14.days

    def call
      {
        sync: sync_section,
        bikes: bikes_section,
        attention: attention_section,
        recent_rides: recent_rides_section,
        stats: stats_section,
      }
    end

    private

    attr_reader :user, :zone

    def credential
      @credential ||= user.strava_credential
    end

    def sync_section
      # StravaActivity.needs_attention_for is the one shared definition of
      # "unattributed and actionable" -- a ride whose gear was explicitly
      # "don't tracked" (and hasn't resurfaced) or that's itself been
      # ride-ignored drops out of this notification entirely, same as if it
      # were attributed. Switching to the shared scope here (rather than this
      # method's own inline query) is what keeps this count, the Rides tab's
      # "Needs attention" view, and its tab badge from ever disagreeing.
      unattributed = StravaActivity.needs_attention_for(user)
      with_gear = unattributed.where.not(gear_id: [ nil, "" ])
      without_gear = unattributed.where(gear_id: [ nil, "" ])

      {
        connected: credential.present?,
        last_synced_at: credential&.last_synced_at,
        rides_total: user.strava_activities.count,
        # Lets the sync strip survive a reload -- useStravaSyncRunner's own
        # `failure` is in-memory only (set from a live poll), so without
        # these the "Sync failed" item would vanish the instant the page
        # refreshes even though the credential still records it. Not
        # exposing last_sync_failed_kind here deliberately -- the strip
        # shows one generic failure line regardless of full vs incremental,
        # leaving the kind-aware detail to the Strava page's own status.
        last_sync_failed_at: credential&.last_sync_failed_at,
        last_sync_error: credential&.last_sync_error,
        last_sync_retry_at: credential&.last_sync_retry_at,
        unattributed: {
          count: unattributed.count,
          distance_meters: unattributed.sum(:distance_meters),
          with_gear: { count: with_gear.count, distance_meters: with_gear.sum(:distance_meters) },
          without_gear: { count: without_gear.count, distance_meters: without_gear.sum(:distance_meters) },
          unmapped_gear_count: StravaGear.unmapped_for(user).count,
        },
      }
    end

    def bikes_section
      distances = user.strava_activities.group(:bike_id).sum(:distance_meters)
      ride_counts = user.strava_activities.group(:bike_id).count
      last_rides = user.strava_activities.group(:bike_id).maximum(:moved_at)
      month_start = Time.current.in_time_zone(zone).beginning_of_month.utc
      this_month_distances = user.strava_activities.where(moved_at: month_start..)
        .group(:bike_id).sum(:distance_meters)

      worst_results = Maintenance::RequirementStatus.worst_result_by_component(user)
      off_bike_by_bike = off_bike_components_by_bike

      user.bikes.where(retired_on: nil).map do |bike|
        {
          id: bike.id,
          name: bike.name,
          total_distance: distances[bike.id] || 0,
          ride_count: ride_counts[bike.id] || 0,
          last_ride_on: last_rides[bike.id],
          distance_this_month: this_month_distances[bike.id] || 0,
          mounted: mounted_payload(bike, worst_results),
          off_bike: (off_bike_by_bike[bike.id] || []).map { |c| off_bike_payload(c, worst_results[c.id]) },
        }
      end
    end

    def mounted_payload(bike, worst_results)
      bike.component_assignments.where(ended_at: nil).includes(:component).map do |assignment|
        component = assignment.component
        result = worst_results[component.id]

        {
          component_id: component.id,
          assignment_id: assignment.id,
          label: component.label,
          category: component.category,
          ride_context: assignment.ride_context,
          service_status: result&.status,
          display_metric: display_metric(component, result),
        }
      end
    end

    def off_bike_payload(component, result)
      {
        component_id: component.id,
        label: component.label,
        category: component.category,
        display_metric: display_metric(component, result),
      }
    end

    # The driving requirement's distance/moving-time/days-used since its
    # setting event, with the requirement's own name and (separately) the
    # setting event's own service type name -- or, with no enabled
    # requirement at all, the component's plain lifetime total_distance
    # (requirement_name: nil signals "this is just a total," not "since a
    # service"). since_service_type_name is specifically the setting
    # event's service type -- with multiple satisfiers this is no longer
    # always the same string as the requirement's own name, so "N km since
    # X" needs its own field rather than reusing requirement_name. Meters/
    # seconds/days only -- formatting into "N km since wax" is the
    # frontend's job, same as everywhere else in the app (see CLAUDE.md:
    # the API always returns meters, the UI always converts via
    # formatDistance).
    def display_metric(component, result)
      if result.nil?
        return {
          requirement_name: nil, distance_meters: component.total_distance,
          moving_time_seconds: nil, days: nil, since_service_type_name: nil,
        }
      end

      requirement_name = result.component_service_requirement.effective[:name]
      since_service_type_name = result.setting_event&.service_type&.name

      base = { requirement_name: requirement_name, since_service_type_name: since_service_type_name }
      case result.driving_dimension
      when :distance
        base.merge(distance_meters: result.distance_used_meters, moving_time_seconds: nil, days: nil)
      when :moving_time
        base.merge(distance_meters: nil, moving_time_seconds: result.moving_time_used_seconds, days: nil)
      else
        base.merge(distance_meters: nil, moving_time_seconds: nil, days: result.days_used)
      end
    end

    # { bike_id => [Component, ...] } for every non-retired component with
    # no active assignment anywhere, grouped by the bike its most recent
    # assignment was on -- the at: Time.current (the default) case of
    # Bikes::ServiceableComponents.off_bike_components_by_bike, which the
    # batch service logger also uses at an arbitrary point in time. One
    # implementation, not two.
    def off_bike_components_by_bike
      Bikes::ServiceableComponents.off_bike_components_by_bike(user)
    end

    # Every enabled interval whose status isn't ok, for a non-retired
    # component -- deliberately broader than the alert banners
    # (Result#banner_eligible?), which also gates on mounted/notifications/
    # dismissal. Those three are included here as flags instead, so the UI
    # can label (not hide) a dismissed or notifications-off item.
    def attention_section
      bikes_by_component = Component.current_bikes_by_component(user)

      items = Maintenance::RequirementStatus.for_user(user).reject { |result| result.status == "ok" || result.retired? }
        .map { |result| attention_item(result, bikes_by_component) }

      items.sort_by { |item| [ -Maintenance::RequirementStatus::SEVERITY.fetch(item[:status]), -item[:fraction_used] ] }
    end

    def attention_item(result, bikes_by_component)
      requirement = result.component_service_requirement
      component = requirement.component
      effective = requirement.effective
      # A component can (rarely) be mounted on more than one bike at once
      # (the documented shared indoor_only-cassette case) -- picking the
      # first is a deliberate display simplification, not a data gap.
      bike = bikes_by_component[component.id]&.first

      {
        component_id: component.id,
        component_label: component.label,
        requirement_id: requirement.id,
        requirement_name: effective[:name],
        satisfiers: effective[:satisfiers],
        status: result.status,
        driving_dimension: result.driving_dimension,
        distance_used_meters: result.distance_used_meters,
        effective_distance_meters: effective[:distance_meters],
        moving_time_used_seconds: result.moving_time_used_seconds,
        effective_moving_time_seconds: effective[:moving_time_seconds],
        days_used: result.days_used,
        effective_calendar_amount: effective[:calendar_amount],
        effective_calendar_unit: effective[:calendar_unit],
        distance_remaining_meters: result.distance_remaining_meters,
        moving_time_remaining_seconds: result.moving_time_remaining_seconds,
        days_remaining: result.days_remaining,
        fraction_used: result.fraction_used,
        setting_event: setting_event_json(result),
        dismissed: result.dismissed?(credential: credential),
        notifications_off: !result.notifications_enabled?,
        mounted: result.mounted?,
        bike: bike,
      }
    end

    # Same shape/reasoning as MaintenanceAlertsController's own
    # setting_event_json -- {id:, service_type_name:, performed_at:} | nil,
    # nil in the synthetic-fallback case (no real satisfying service logged
    # yet). No shared module for two three-line methods across a
    # controller and a service object; duplication here is cheaper than
    # the indirection.
    def setting_event_json(result)
      event = result.setting_event
      return nil unless event

      { id: event.id, service_type_name: event.service_type.name, performed_at: event.performed_at }
    end

    # Riding totals for the summary tiles, in the viewer's tz. Every synced
    # ride counts -- no bike, ignored gear and indoor included, since these
    # are riding totals, not wear -- except rides individually ignored via
    # ignored_at. Two queries, whatever the windows: one row of FILTERed
    # aggregates for every total, and one GROUP BY local day for the week's
    # bars. Boundaries are computed here in the zone and passed as UTC.
    def stats_section
      now = Time.current.in_time_zone(zone)
      week_start = now.beginning_of_week(:monday)
      week_end = week_start + 7.days
      month_start = now.beginning_of_month
      month_end = month_start.next_month
      year_start = now.beginning_of_year
      last_year_start = year_start - 1.year
      # ActiveSupport clamps Feb 29 to Feb 28 at the same local time.
      last_year_now = now - 1.year

      scope = user.strava_activities.not_ignored
      aggregates = [
        *window_totals(week_start, week_end),
        *window_totals(month_start, month_end),
        window_aggregate("SUM(distance_meters)", year_start, now),
        window_aggregate("SUM(distance_meters)", last_year_start, last_year_now),
        window_aggregate("SUM(distance_meters)", last_year_start, year_start),
      ]
      # Each column needs its own alias: unaliased they're all "coalesce",
      # and ActiveRecord would cast every one with the first column's type
      # (bigint), truncating the float elevation sums.
      totals = scope.where(moved_at: last_year_start.utc...[ week_end, month_end, now ].max.utc)
        .pick(*aggregates.each_with_index.map { |sql, index| Arel.sql("#{sql} AS stat_#{index}") })
      week_totals = totals[0, 4]
      month_totals = totals[4, 4]
      ytd, last_ytd, last_year_total = totals[8, 3]

      {
        today: now.to_date.iso8601,
        week: totals_payload(week_totals).merge(start_date: week_start.to_date.iso8601, daily: daily_distances(scope, week_start, week_end)),
        month: totals_payload(month_totals).merge(start_date: month_start.to_date.iso8601),
        year_to_date: {
          distance_meters: ytd.to_i,
          last_year_to_date_distance_meters: last_ytd.to_i,
          last_year_total_distance_meters: last_year_total.to_i,
        },
      }
    end

    def window_totals(from, to)
      [
        window_aggregate("SUM(distance_meters)", from, to),
        window_aggregate("SUM(COALESCE(moving_time, 0))", from, to),
        window_aggregate("SUM(COALESCE(total_elevation_gain, 0))", from, to),
        window_aggregate("COUNT(*)", from, to),
      ]
    end

    # Half-open [from, to), like every other window in the app.
    def window_aggregate(aggregate, from, to)
      ActiveRecord::Base.sanitize_sql_array(
        [ "COALESCE(#{aggregate} FILTER (WHERE moved_at >= ? AND moved_at < ?), 0)", from.utc, to.utc ],
      )
    end

    def totals_payload((distance, moving_time, elevation, count))
      {
        distance_meters: distance.to_i,
        moving_time_seconds: moving_time.to_i,
        elevation_gain_meters: elevation.to_f.round(1),
        ride_count: count.to_i,
      }
    end

    # Seven {date, distance_meters}, Mon..Sun, zero-filled, grouped in SQL.
    # The day boundaries (local midnights, DST-aware) come from Ruby's zone
    # data and are bucketed with width_bucket, rather than grouping by
    # `moved_at AT TIME ZONE <name>`: Postgres ships its own tz database,
    # which can disagree with Ruby's (America/Vancouver's 2026 switch to
    # permanent UTC-7 is in one and not the other), and these days have to
    # line up exactly with the week boundary computed above.
    def daily_distances(scope, week_start, week_end)
      day_starts = (0..7).map { |offset| (week_start + offset.days).utc }
      bucket = ActiveRecord::Base.sanitize_sql_array([ "width_bucket(moved_at, ARRAY[?]::timestamp[])", day_starts ])
      by_bucket = scope.where(moved_at: week_start.utc...week_end.utc).group(Arel.sql(bucket)).sum(:distance_meters)

      (0..6).map do |offset|
        { date: (week_start.to_date + offset).iso8601, distance_meters: by_bucket[offset + 1].to_i }
      end
    end

    def recent_rides_section
      since = RECENT_RIDES_WINDOW.ago
      rides = user.strava_activities.where(moved_at: since..).order(moved_at: :desc).to_a
      counted_toward = Maintenance::CountedTowardQuery.call(user, since: since)
      bikes_by_id = user.bikes.index_by(&:id)

      {
        summary: { count: rides.size, distance_meters: rides.sum(&:distance_meters) },
        rides: rides.map { |ride| recent_ride_payload(ride, counted_toward[ride.id], bikes_by_id) },
      }
    end

    def recent_ride_payload(ride, counted_toward, bikes_by_id)
      bike = ride.bike_id && bikes_by_id[ride.bike_id]

      {
        id: ride.id,
        moved_at: ride.moved_at,
        name: ride.name,
        distance_meters: ride.distance_meters,
        # Lets "Log service after this ride" prefill the session at the
        # ride's end; nil (Strava omitted it) falls back to moved_at.
        elapsed_time: ride.elapsed_time,
        bike: bike && { id: bike.id, name: bike.name },
        # Present alongside a nil bike specifically for the "fixable via gear
        # mapping" case (same distinction as sync.unattributed.with_gear) --
        # lets the frontend offer "Link Strava gear" only when there's
        # actually a gear id to map, not for a ride Strava itself had no
        # bike set on.
        gear_id: ride.gear_id,
        indoor: ride.indoor?,
        counted_toward: (counted_toward || []).map { |c| { component_id: c[:component_id], label: c[:label] } },
      }
    end
  end
end
