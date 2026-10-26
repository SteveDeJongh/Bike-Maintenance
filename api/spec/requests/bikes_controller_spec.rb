require "rails_helper"

RSpec.describe "Bikes", type: :request do
  let!(:current_user) { create(:user) }

  describe "GET /bikes/:id" do
    it "succeeds for a bike with an installed component (regression: as_json methods must not reference a deleted model method)" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain")
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)

      get "/bikes/#{bike.id}"

      expect(response).to have_http_status(:ok)
    end

    it "includes each installed component's worst service_status" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain")
      service_type = create(:service_type, user: current_user, name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      get "/bikes/#{bike.id}"

      assignment = JSON.parse(response.body)["component_assignments"].first
      expect(assignment["component"]["service_status"]).to eq("due")
    end
  end
end
