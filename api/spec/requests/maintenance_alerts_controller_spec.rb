require "rails_helper"

RSpec.describe "MaintenanceAlerts", type: :request do
  let!(:current_user) { create(:user) }

  describe "GET /maintenance_alerts" do
    it "returns a due, currently-installed interval" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain")
      service_type = create(:service_type, user: current_user, name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      get "/maintenance_alerts"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.length).to eq(1)
      expect(body.first["status"]).to eq("due")
      expect(body.first["component_id"]).to eq(component.id)
    end

    it "excludes an ok interval, and only current_user's intervals" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain")
      service_type = create(:service_type, user: current_user, name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000_000)
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      other_bike = create(:bike)
      other_component = create(:component, user: other_bike.user, category: "chain")
      other_service_type = create(:service_type, user: other_bike.user, name: "wax")
      create(:component_service_interval, component: other_component, service_type: other_service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: other_component, bike: other_bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: other_bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      get "/maintenance_alerts"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq([])
    end
  end
end
