module Bikes
  # Each bike's mounted and off-bike components with their wear, for Home's
  # bike cards (Dashboard::Summary, every active bike) and the bike page's
  # Up next/rotation section (BikesController#show, one bike). Off-bike
  # components are grouped by the bike their most recent assignment was
  # on (Bikes::ServiceableComponents.off_bike_components_by_bike).
  #
  # Returns { bike_id => { mounted: [...], off_bike: [...] } }. Pass the
  # caller's worst_results (RequirementStatus.worst_result_by_component) so
  # statuses are computed once per request.
  class CardComponents
    def self.call(user, bikes:, worst_results:)
      new(user, worst_results).call(bikes)
    end

    def initialize(user, worst_results)
      @user = user
      @worst_results = worst_results
    end

    def call(bikes)
      off_bike_by_bike = Bikes::ServiceableComponents.off_bike_components_by_bike(user)
      # Categories set to rotate (ComponentCategorySetting#rotates); a
      # category with no settings row behaves as the default, false.
      rotating = user.component_category_settings.where(rotates: true).pluck(:category).to_set

      bikes.to_h do |bike|
        assignments = bike.component_assignments.where(ended_at: nil).includes(:component).to_a
        off_bike = off_bike_by_bike[bike.id] || []
        paired_ids = rotation_component_ids(assignments.map(&:component), off_bike, rotating)

        [
          bike.id,
          {
            mounted: assignments.map { |assignment| mounted_payload(assignment, paired_ids) },
            off_bike: off_bike.map { |component| off_bike_payload(component, paired_ids, rotating) },
          },
        ]
      end
    end

    private

    attr_reader :user, :worst_results

    # Components in a rotation pair on this bike: every off-bike component
    # in a rotating category that also has a mounted component, plus those
    # mounted partners. Only these get total_distance_meters -- the card's
    # rotation strip is the one place lifetime distance is needed for both
    # sides.
    def rotation_component_ids(mounted_components, off_bike, rotating)
      paired_categories = (mounted_components.map(&:category) & off_bike.map(&:category)).select { |c| rotating.include?(c) }
      (mounted_components + off_bike).select { |c| paired_categories.include?(c.category) }.map(&:id).to_set
    end

    def mounted_payload(assignment, paired_ids)
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
      }.merge(wear_fields(component, result, paired_ids))
    end

    # service_status and last_service_at (the setting event's date) let the
    # bike page's rotation card say "waxed Nov 20, ready".
    def off_bike_payload(component, paired_ids, rotating)
      result = worst_results[component.id]

      {
        component_id: component.id,
        label: component.label,
        category: component.category,
        rotates: rotating.include?(component.category),
        service_status: result&.status,
        last_service_at: result&.setting_event&.performed_at,
        display_metric: display_metric(component, result),
      }.merge(wear_fields(component, result, paired_ids))
    end

    # The driving requirement's progress for the card's wear bar (all nil
    # with no enabled requirement), plus lifetime distance for components in
    # a rotation pair. Component#total_distance runs one query per
    # assignment -- fine for the few paired components on a card, and an
    # open batching question if more of the page ever needs it.
    def wear_fields(component, result, paired_ids)
      Maintenance::WearFields.call(result).except(:service_status).merge(
        total_distance_meters: paired_ids.include?(component.id) ? component.total_distance : nil,
      )
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
    # frontend's job (the API always returns meters).
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
  end
end
