class MaintenanceAlertsController < ApplicationController
  # GET /maintenance_alerts
  # Banner-eligible (installed, not retired, notifications on for the
  # category, not currently dismissed) non-ok statuses for current_user.
  def index
    credential = current_user.strava_credential
    statuses = Maintenance::IntervalStatus.for_user(current_user)
    eligible = statuses.select { |status| status.banner_eligible?(credential: credential) }

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
      }
    end
end
