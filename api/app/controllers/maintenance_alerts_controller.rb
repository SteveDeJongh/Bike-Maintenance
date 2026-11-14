class MaintenanceAlertsController < ApplicationController
  # GET /maintenance_alerts
  # Banner-eligible (installed, not retired, notifications on for the
  # category, not currently dismissed) non-ok statuses for current_user --
  # optionally scoped to one bike or one component (the Bike/Component
  # detail pages' own banners; unscoped is unused by the frontend now, but
  # stays supported).
  def index
    eligible = Maintenance::RequirementStatus.banner_eligible_for_user(
      current_user, bike_id: params[:bike_id], component_id: params[:component_id],
    )

    render json: eligible.map { |status| serialize(status) }
  end

  private
    def serialize(status)
      requirement = status.component_service_requirement
      component = requirement.component

      {
        component_service_requirement_id: requirement.id,
        component_id: component.id,
        component_label: component.label,
        category: component.category,
        requirement_name: requirement.effective[:name],
        status: status.status,
        distance_remaining_meters: status.distance_remaining_meters,
        moving_time_remaining_seconds: status.moving_time_remaining_seconds,
        days_remaining: status.days_remaining,
        setting_event: setting_event_json(status),
        setting_position: status.setting_position,
        # Every bike this component is currently mounted on -- almost always
        # one, but a category with allows_multiple_assignments can have the
        # same component concurrently indoor_only on two bikes, and that
        # alert belongs on both bikes' pages.
        bike_ids: component.component_assignments.where(ended_at: nil).pluck(:bike_id),
      }
    end

    # {id:, service_type_name:, performed_at:} | nil -- nil in the
    # synthetic-fallback case (no real satisfying service logged yet). The
    # backend never pre-formats this into a display string ("drip wax at
    # 2,140 km") -- setting_position is the raw number/date, same
    # meters-not-km convention as everywhere else in this app; the frontend
    # assembles the sentence.
    def setting_event_json(status)
      event = status.setting_event
      return nil unless event

      { id: event.id, service_type_name: event.service_type.name, performed_at: event.performed_at }
    end
end
