class ServiceAlertDismissalsController < ApplicationController
  # POST /service_alert_dismissals
  def create
    requirement = find_requirement(params[:component_service_requirement_id])
    status = status_for(requirement)

    dismissal = requirement.service_alert_dismissals.create!(dismissed_at: Time.current, dismissed_status: status.status)
    render json: dismissal, status: :created
  end

  # POST /service_alert_dismissals/dismiss_all
  # Dismisses every currently banner-eligible alert at once, or just those of
  # one status (params[:status]) -- backs each banner's own "dismiss all",
  # which must not also clear the other banner's alerts. Also accepts the
  # same bike_id/component_id scope as GET /maintenance_alerts, so a scoped
  # banner's "dismiss all" only ever dismisses what that banner was showing
  # -- unscoped (every page, before the Bike/Component detail banners
  # existed) still works, kept for backwards compatibility, but the
  # frontend no longer calls it that way.
  def dismiss_all
    eligible = Maintenance::RequirementStatus.banner_eligible_for_user(
      current_user, bike_id: params[:bike_id], component_id: params[:component_id],
    )
    eligible = eligible.select { |status| status.status == params[:status] } if params[:status].present?

    eligible.each do |status|
      status.component_service_requirement.service_alert_dismissals.create!(
        dismissed_at: Time.current, dismissed_status: status.status,
      )
    end

    head :no_content
  end

  private
    def find_requirement(id)
      ComponentServiceRequirement.joins(:component).where(components: { user_id: current_user.id }).find(id)
    end

    def status_for(requirement)
      Maintenance::RequirementStatus.for_component(requirement.component).find { |s| s.component_service_requirement.id == requirement.id }
    end
end
