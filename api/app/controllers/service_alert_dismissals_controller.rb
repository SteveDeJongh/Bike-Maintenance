class ServiceAlertDismissalsController < ApplicationController
  # POST /service_alert_dismissals
  def create
    interval = find_interval(params[:component_service_interval_id])
    status = status_for(interval)

    dismissal = interval.service_alert_dismissals.create!(dismissed_at: Time.current, dismissed_status: status.status)
    render json: dismissal, status: :created
  end

  # POST /service_alert_dismissals/dismiss_all
  # Dismisses every currently banner-eligible alert at once, or just those of
  # one status (params[:status]) -- backs each banner's own "dismiss all",
  # which must not also clear the other banner's alerts.
  def dismiss_all
    credential = current_user.strava_credential
    statuses = Maintenance::IntervalStatus.for_user(current_user)
    eligible = statuses.select { |status| status.banner_eligible?(credential: credential) }
    eligible = eligible.select { |status| status.status == params[:status] } if params[:status].present?

    eligible.each do |status|
      status.component_service_interval.service_alert_dismissals.create!(
        dismissed_at: Time.current, dismissed_status: status.status,
      )
    end

    head :no_content
  end

  private
    def find_interval(id)
      ComponentServiceInterval.joins(:component).where(components: { user_id: current_user.id }).find(id)
    end

    def status_for(interval)
      Maintenance::IntervalStatus.for_component(interval.component).find { |s| s.component_service_interval.id == interval.id }
    end
end
