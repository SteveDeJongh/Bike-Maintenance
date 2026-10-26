require "rails_helper"

# This controller is otherwise plain CRUD; this spec exists narrowly for
# #show's service_intervals inclusion, the one piece of real controller
# logic here (not covered by Component's own model specs, which don't
# exercise the JSON serialization layer).
RSpec.describe "Components", type: :request do
  let!(:current_user) { create(:user) }

  describe "GET /components/:id" do
    it "includes each enabled interval's computed status" do
      component = create(:component, user: current_user, category: "chain")
      service_type = create(:service_type, user: current_user, name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)

      get "/components/#{component.id}"

      expect(response).to have_http_status(:ok)
      intervals = JSON.parse(response.body)["service_intervals"]
      expect(intervals.length).to eq(1)
      expect(intervals.first["service_type_name"]).to eq("wax")
      expect(intervals.first["status"]).to eq("ok")
    end

    it "excludes a disabled interval" do
      component = create(:component, user: current_user, category: "chain")
      service_type = create(:service_type, user: current_user, name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, enabled: false)

      get "/components/#{component.id}"

      expect(JSON.parse(response.body)["service_intervals"]).to eq([])
    end
  end
end
