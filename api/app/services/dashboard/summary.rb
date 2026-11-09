module Dashboard
  # Assembles the one GET /dashboard payload entirely from existing
  # services/queries -- no distance or status computation happens here that
  # doesn't already live in Maintenance::IntervalStatus/BatchedDistanceQuery,
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

      worst_results = Maintenance::IntervalStatus.worst_result_by_component(user)
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

    # The driving interval's distance-or-days-used since its baseline, with
    # its service type name -- or, with no enabled interval at all, the
    # component's plain lifetime total_distance (service_type_name: nil
    # signals "this is just a total," not "since a service"). Meters/days
    # only -- formatting into "N km since wax" is the frontend's job, same
    # as everywhere else in the app (see CLAUDE.md: the API always returns
    # meters, the UI always converts via formatDistance).
    def display_metric(component, result)
      return { service_type_name: nil, distance_meters: component.total_distance, days: nil } if result.nil?

      service_type_name = result.component_service_interval.service_type.name
      if result.driving_dimension == :distance
        { service_type_name: service_type_name, distance_meters: result.distance_used_meters, days: nil }
      else
        { service_type_name: service_type_name, distance_meters: nil, days: result.days_used }
      end
    end

    # { bike_id => [Component, ...] } for every non-retired component with
    # no active assignment anywhere, grouped by its most recent assignment's
    # bike -- bounded by "currently unmounted" components (typically a
    # handful), so one query per component here is fine, same precedent as
    # Component#total_distance's per-assignment looping (see CLAUDE.md).
    def off_bike_components_by_bike
      mounted_component_ids = Component.current_bikes_by_component(user).keys
      unmounted = user.components.where(retired_on: nil).where.not(id: mounted_component_ids)

      unmounted.each_with_object(Hash.new { |h, k| h[k] = [] }) do |component, hash|
        last_assignment = component.component_assignments.order(started_at: :desc).first
        hash[last_assignment.bike_id] << component if last_assignment
      end
    end

    # Every enabled interval whose status isn't ok, for a non-retired
    # component -- deliberately broader than the alert banners
    # (Result#banner_eligible?), which also gates on mounted/notifications/
    # dismissal. Those three are included here as flags instead, so the UI
    # can label (not hide) a dismissed or notifications-off item.
    def attention_section
      bikes_by_component = Component.current_bikes_by_component(user)

      items = Maintenance::IntervalStatus.for_user(user).reject { |result| result.status == "ok" || result.retired? }
        .map { |result| attention_item(result, bikes_by_component) }

      items.sort_by { |item| [ -Maintenance::IntervalStatus::SEVERITY.fetch(item[:status]), -item[:fraction_used] ] }
    end

    def attention_item(result, bikes_by_component)
      interval = result.component_service_interval
      component = interval.component
      # A component can (rarely) be mounted on more than one bike at once
      # (the documented shared indoor_only-cassette case) -- picking the
      # first is a deliberate display simplification, not a data gap.
      bike = bikes_by_component[component.id]&.first

      {
        component_id: component.id,
        component_label: component.label,
        service_type_id: interval.service_type_id,
        service_type_name: interval.service_type.name,
        status: result.status,
        driving_dimension: result.driving_dimension,
        distance_used_meters: result.distance_used_meters,
        effective_distance_interval_meters: interval.effective_distance_interval_meters,
        days_used: result.days_used,
        effective_time_interval_days: interval.effective_time_interval_days,
        distance_remaining_meters: result.distance_remaining_meters,
        days_remaining: result.days_remaining,
        fraction_used: result.fraction_used,
        dismissed: result.dismissed?(credential: credential),
        notifications_off: !result.notifications_enabled?,
        mounted: result.mounted?,
        bike: bike,
      }
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
