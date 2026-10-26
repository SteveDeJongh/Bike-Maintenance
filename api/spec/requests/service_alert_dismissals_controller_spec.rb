require "rails_helper"

RSpec.describe "ServiceAlertDismissals", type: :request do
  let!(:current_user) { create(:user) }

  def due_interval(user)
    bike = create(:bike, user: user)
    component = create(:component, user: user, category: "chain")
    service_type = create(:service_type, user: user)
    interval = create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
    create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)
    interval
  end

  describe "POST /service_alert_dismissals" do
    it "records the current status as the dismissal" do
      interval = due_interval(current_user)

      post "/service_alert_dismissals", params: { component_service_interval_id: interval.id }

      expect(response).to have_http_status(:created)
      dismissal = interval.service_alert_dismissals.first
      expect(dismissal.dismissed_status).to eq("due")
    end

    it "does not allow dismissing another user's interval" do
      other_interval = due_interval(create(:user))

      post "/service_alert_dismissals", params: { component_service_interval_id: other_interval.id }

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /service_alert_dismissals/dismiss_all" do
    it "dismisses every currently banner-eligible alert" do
      interval_a = due_interval(current_user)
      interval_b = due_interval(current_user)

      post "/service_alert_dismissals/dismiss_all"

      expect(response).to have_http_status(:no_content)
      expect(interval_a.service_alert_dismissals.count).to eq(1)
      expect(interval_b.service_alert_dismissals.count).to eq(1)

      get "/maintenance_alerts"
      expect(JSON.parse(response.body)).to eq([])
    end
  end
end
