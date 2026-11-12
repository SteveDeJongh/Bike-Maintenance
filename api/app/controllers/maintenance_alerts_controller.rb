class MaintenanceAlertsController < ApplicationController
  # GET /maintenance_alerts
  # Banner-eligible (installed, not retired, notifications on for the
  # category, not currently dismissed) non-ok statuses for current_user --
  # optionally scoped to one bike or one component (the Bike/Component
  # detail pages' own banners; unscoped is unused by the frontend now, but
  # stays supported).
  def index
    eligible = Maintenance::IntervalStatus.banner_eligible_for_user(
      current_user, bike_id: params[:bike_id], component_id: params[:component_id],
    )

    render json: eligible.map { |status| serialize(status) }
  end

  private
    def serialize(status)
      interval = status.component_service_interval
      component = interval.component

      {
        component_service_interval_id: interval.id,
        component_id: component.id,
        component_label: component.label,
        category: component.category,
        service_type_name: interval.service_type.name,
        status: status.status,
        distance_remaining_meters: status.distance_remaining_meters,
        days_remaining: status.days_remaining,
        # Every bike this component is currently mounted on -- almost always
        # one, but a category with allows_multiple_assignments can have the
        # same component concurrently indoor_only on two bikes, and that
        # alert belongs on both bikes' pages.
        bike_ids: component.component_assignments.where(ended_at: nil).pluck(:bike_id),
      }
    end
end
