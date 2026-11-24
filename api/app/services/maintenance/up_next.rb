module Maintenance
  # Up next's two lists, shared by Home (Dashboard::Summary, user-wide) and
  # the bike page (BikesController#show, bike_id: scoped):
  # - attention: every due and warning requirement on a non-retired
  #   component, most severe then most worn first;
  # - upcoming: the nearest-to-due ok requirements on mounted, non-retired
  #   components.
  # bike_id keeps only components currently mounted on that bike, so a
  # bike's upcoming list is its own nearest `limit`, not a slice of the
  # user-wide one. Built from one RequirementStatus.for_user list.
  class UpNext
    UPCOMING_LIMIT = 5

    def initialize(results:, bikes_by_component:, credential:)
      @results = results
      @bikes_by_component = bikes_by_component
      @credential = credential
    end

    def attention(bike_id: nil)
      items = scoped(bike_id).reject { |result| result.status == "ok" || result.retired? }.map { |result| item(result) }
      items.sort_by { |item| [ -RequirementStatus::SEVERITY.fetch(item[:status]), -item[:fraction_used] ] }
    end

    def upcoming(bike_id: nil, limit: UPCOMING_LIMIT)
      scoped(bike_id)
        .select { |result| result.status == "ok" && !result.retired? && mounted_on(result).any? }
        .sort_by { |result| -result.fraction_used }
        .first(limit)
        .map { |result| item(result) }
    end

    private

    attr_reader :results, :bikes_by_component, :credential

    def component_id(result)
      result.component_service_requirement.component_id
    end

    # The bikes a result's component is mounted on now. fetch, never []:
    # Component.current_bikes_by_component's default block would insert an
    # empty entry for any unmounted component it was asked about, which a
    # later key? "is it mounted" check would then wrongly see.
    def mounted_on(result)
      bikes_by_component.fetch(component_id(result), [])
    end

    def scoped(bike_id)
      return results if bike_id.nil?

      results.select { |result| mounted_on(result).any? { |bike| bike[:id] == bike_id } }
    end

    def item(result)
      requirement = result.component_service_requirement
      component = requirement.component
      effective = requirement.effective
      # A component can (rarely) be mounted on more than one bike at once
      # (the documented shared indoor_only-cassette case) -- picking the
      # first is a deliberate display simplification, not a data gap.
      bike = bikes_by_component.fetch(component.id, []).first&.slice(:id, :name)

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
  end
end
