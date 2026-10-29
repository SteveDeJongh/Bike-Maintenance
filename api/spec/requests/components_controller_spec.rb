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

    it "still includes a disabled interval, with its own computed status, so it can be re-enabled in place" do
      component = create(:component, user: current_user, category: "chain")
      service_type = create(:service_type, user: current_user, name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000, enabled: false)

      get "/components/#{component.id}"

      intervals = JSON.parse(response.body)["service_intervals"]
      expect(intervals.length).to eq(1)
      expect(intervals.first["enabled"]).to eq(false)
      expect(intervals.first["status"]).to eq("ok")
    end

    it "includes current_bikes, empty when not currently installed" do
      component = create(:component, user: current_user)

      get "/components/#{component.id}"

      expect(JSON.parse(response.body)["current_bikes"]).to eq([])
    end

    it "includes the one bike a component is currently installed on" do
      bike = create(:bike, user: current_user, name: "Juan Solo")
      component = create(:component, user: current_user)
      create(:component_assignment, component: component, bike: bike, ended_at: nil)

      get "/components/#{component.id}"

      expect(JSON.parse(response.body)["current_bikes"]).to eq([ { "id" => bike.id, "name" => "Juan Solo" } ])
    end

    it "includes both bikes for a component concurrently shared indoor_only across two bikes" do
      create(:component_category_setting, user: current_user, category: "cassette", allows_multiple_assignments: true)
      component = create(:component, user: current_user, category: "cassette")
      bike_a = create(:bike, user: current_user, name: "Road Bike")
      bike_b = create(:bike, user: current_user, name: "Trainer Bike")
      create(:component_assignment, component: component, bike: bike_a, ride_context: "indoor_only", ended_at: nil)
      create(:component_assignment, component: component, bike: bike_b, ride_context: "indoor_only", ended_at: nil)

      get "/components/#{component.id}"

      names = JSON.parse(response.body)["current_bikes"].map { |b| b["name"] }
      expect(names).to contain_exactly("Road Bike", "Trainer Bike")
    end
  end

  describe "GET /components" do
    it "includes each component's worst service_status, nil when it has no enabled intervals" do
      bike = create(:bike, user: current_user)
      due_component = create(:component, user: current_user, category: "chain")
      service_type = create(:service_type, user: current_user, name: "wax")
      create(:component_service_interval, component: due_component, service_type: service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: due_component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      bare_component = create(:component, user: current_user, category: "saddle")

      get "/components"

      by_id = JSON.parse(response.body).index_by { |c| c["id"] }
      expect(by_id[due_component.id]["service_status"]).to eq("due")
      expect(by_id[bare_component.id]["service_status"]).to be_nil
    end

    it "includes current_bikes per component, batched, including the two-bikes-at-once case" do
      create(:component_category_setting, user: current_user, category: "cassette", allows_multiple_assignments: true)
      shared_component = create(:component, user: current_user, category: "cassette")
      bike_a = create(:bike, user: current_user, name: "Road Bike")
      bike_b = create(:bike, user: current_user, name: "Trainer Bike")
      create(:component_assignment, component: shared_component, bike: bike_a, ride_context: "indoor_only", ended_at: nil)
      create(:component_assignment, component: shared_component, bike: bike_b, ride_context: "indoor_only", ended_at: nil)

      bare_component = create(:component, user: current_user, category: "saddle")

      get "/components"

      by_id = JSON.parse(response.body).index_by { |c| c["id"] }
      shared_names = by_id[shared_component.id]["current_bikes"].map { |b| b["name"] }
      expect(shared_names).to contain_exactly("Road Bike", "Trainer Bike")
      expect(by_id[bare_component.id]["current_bikes"]).to eq([])
    end
  end
end
