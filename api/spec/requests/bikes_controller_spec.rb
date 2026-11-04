require "rails_helper"

RSpec.describe "Bikes", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /bikes" do
    it "never includes another user's bikes" do
      mine = create(:bike, user: current_user)
      create(:bike) # another user's

      get "/bikes"

      expect(JSON.parse(response.body).map { |b| b["id"] }).to eq([mine.id])
    end
  end

  describe "cross-account isolation" do
    it "404s on GET /bikes/:id for another user's bike" do
      other_bike = create(:bike)

      get "/bikes/#{other_bike.id}"

      expect(response).to have_http_status(:not_found)
    end

    it "404s on PATCH /bikes/:id for another user's bike" do
      other_bike = create(:bike, name: "Original")

      patch "/bikes/#{other_bike.id}", params: { bike: { name: "Hijacked" } }

      expect(response).to have_http_status(:not_found)
      expect(other_bike.reload.name).to eq("Original")
    end

    it "404s on DELETE /bikes/:id for another user's bike" do
      other_bike = create(:bike)

      delete "/bikes/#{other_bike.id}"

      expect(response).to have_http_status(:not_found)
      expect(Bike.exists?(other_bike.id)).to be true
    end
  end

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
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      get "/bikes/#{bike.id}"

      assignment = JSON.parse(response.body)["component_assignments"].first
      expect(assignment["component"]["service_status"]).to eq("due")
    end
  end
end
