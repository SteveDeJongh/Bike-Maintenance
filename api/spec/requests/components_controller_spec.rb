require "rails_helper"

# This controller is otherwise plain CRUD; this spec exists narrowly for
# #show's service_requirements inclusion, the one piece of real controller
# logic here (not covered by Component's own model specs, which don't
# exercise the JSON serialization layer).
RSpec.describe "Components", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /components" do
    it "never includes another user's components" do
      mine = create(:component, user: current_user)
      create(:component) # another user's

      get "/components"

      expect(JSON.parse(response.body).map { |c| c["id"] }).to eq([mine.id])
    end
  end

  describe "cross-account isolation" do
    it "404s on GET /components/:id for another user's component" do
      other_component = create(:component)

      get "/components/#{other_component.id}"

      expect(response).to have_http_status(:not_found)
    end

    it "404s on PATCH /components/:id for another user's component" do
      other_component = create(:component, label: "Original")

      patch "/components/#{other_component.id}", params: { component: { label: "Hijacked" } }

      expect(response).to have_http_status(:not_found)
      expect(other_component.reload.label).to eq("Original")
    end

    it "404s on DELETE /components/:id for another user's component" do
      other_component = create(:component)

      delete "/components/#{other_component.id}"

      expect(response).to have_http_status(:not_found)
      expect(Component.exists?(other_component.id)).to be true
    end
  end

  describe "POST /components" do
    it "accepts brand, model, and notes" do
      post "/components", params: {
        component: {
          label: "Chain A", category: "chain", acquired_on: "2026-01-01",
          brand: "Shimano", model: "105", notes: "Waxed before first install",
        },
      }

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["brand"]).to eq("Shimano")
      expect(body["model"]).to eq("105")
      expect(body["notes"]).to eq("Waxed before first install")
    end

    it "adds a new brand to the category's common_brands" do
      post "/components", params: {
        component: { label: "Fender A", category: "fenders", brand: "SKS" },
      }

      expect(response).to have_http_status(:created)
      expect(current_user.component_category_settings.find_by(category: "fenders").common_brands).to eq(%w[SKS])
    end
  end

  describe "PATCH /components/:id" do
    it "adds a new brand to the category's common_brands" do
      component = create(:component, user: current_user, category: "fenders", brand: "SKS")

      patch "/components/#{component.id}", params: { component: { brand: "Portland Design Works" } }

      expect(response).to have_http_status(:ok)
      expect(current_user.component_category_settings.find_by(category: "fenders").common_brands)
        .to eq(["SKS", "Portland Design Works"])
    end
  end

  describe "GET /components/:id" do
    it "includes each enabled requirement's computed status" do
      component = create(:component, user: current_user, category: "chain")
      service_type = current_user.service_types.find_by!(name: "wax")
      requirement = create(:component_service_requirement, component: component, service_type: service_type, distance_interval_meters: 1_000)

      get "/components/#{component.id}"

      expect(response).to have_http_status(:ok)
      requirements = JSON.parse(response.body)["service_requirements"]
      expect(requirements.length).to eq(1)
      item = requirements.first
      expect(item["requirement_name"]).to eq(requirement.name)
      expect(item["satisfiers"].first["service_type_name"]).to eq("wax")
      expect(item["status"]).to eq("ok")
      expect(item["setting_event"]).to be_nil
      expect(item["setting_position"]).to eq(0)
    end

    it "still includes a disabled requirement, with its own computed status, so it can be re-enabled in place" do
      component = create(:component, user: current_user, category: "chain")
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:component_service_requirement, component: component, service_type: service_type, distance_interval_meters: 1_000, enabled: false)

      get "/components/#{component.id}"

      requirements = JSON.parse(response.body)["service_requirements"]
      expect(requirements.length).to eq(1)
      expect(requirements.first["enabled"]).to eq(false)
      expect(requirements.first["status"]).to eq("ok")
    end

    it "includes current_bikes, empty when not currently installed" do
      component = create(:component, user: current_user)

      get "/components/#{component.id}"

      expect(JSON.parse(response.body)["current_bikes"]).to eq([])
    end

    it "includes the one bike a component is currently installed on, with that assignment's own id (for swap)" do
      bike = create(:bike, user: current_user, name: "Juan Solo")
      component = create(:component, user: current_user)
      assignment = create(:component_assignment, component: component, bike: bike, ended_at: nil)

      get "/components/#{component.id}"

      expect(JSON.parse(response.body)["current_bikes"]).to eq(
        [ { "id" => bike.id, "name" => "Juan Solo", "assignment_id" => assignment.id, "ride_context" => "both" } ],
      )
    end

    it "includes both bikes for a component concurrently shared indoor_only across two bikes" do
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
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:component_service_requirement, component: due_component, service_type: service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: due_component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      bare_component = create(:component, user: current_user, category: "saddle")

      get "/components"

      by_id = JSON.parse(response.body).index_by { |c| c["id"] }
      expect(by_id[due_component.id]["service_status"]).to eq("due")
      expect(by_id[bare_component.id]["service_status"]).to be_nil
    end

    it "includes current_bikes per component, batched, including the two-bikes-at-once case" do
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
      expect(by_id[shared_component.id]["current_bikes"].map { |b| b["ride_context"] }).to eq(%w[indoor_only indoor_only])
      expect(by_id[bare_component.id]["current_bikes"]).to eq([])
    end
  end
  describe "GET /components list fields" do
    let!(:bike_a) { create(:bike, user: current_user, name: "Juan Solo") }
    let!(:bike_b) { create(:bike, user: current_user, name: "Soloist") }

    def entries
      get "/components"
      JSON.parse(response.body).index_by { |c| c["id"] }
    end

    it "gives an installed component its wear, lifetime distance and assigned_since" do
      chain = create(:component, user: current_user, category: "chain")
      wax = current_user.service_types.find_by!(name: "wax")
      create(:component_service_requirement, component: chain, service_type: wax, distance_interval_meters: 4_000)
      started = Time.zone.local(2026, 1, 1)
      create(:component_assignment, component: chain, bike: bike_a, started_at: started, ended_at: nil)
      create(:strava_activity, bike: bike_a, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      entry = entries[chain.id]

      expect(entry).to include(
        "service_status" => "ok", "has_enabled_requirement" => true, "driving_dimension" => "distance",
        "distance_remaining_meters" => 3_000, "lifetime_distance_meters" => 1_000,
      )
      expect(entry["fraction_used"]).to be_within(0.001).of(0.25)
      expect(Time.zone.parse(entry["assigned_since"])).to eq(started)
      expect(entry["current_bikes"].first).not_to have_key("started_at")
    end

    it "gives a component with no enabled requirement nil wear and has_enabled_requirement false" do
      saddle = create(:component, user: current_user, category: "saddle")

      expect(entries[saddle.id]).to include(
        "has_enabled_requirement" => false, "service_status" => nil, "fraction_used" => nil,
        "driving_dimension" => nil, "lifetime_distance_meters" => 0, "assigned_since" => nil,
      )
    end

    it "uses a shared cassette's earliest open assignment for assigned_since" do
      cassette = create(:component, user: current_user, category: "cassette")
      create(:component_assignment, component: cassette, bike: bike_a, ride_context: "indoor_only", started_at: Time.zone.local(2026, 2, 1), ended_at: nil)
      create(:component_assignment, component: cassette, bike: bike_b, ride_context: "indoor_only", started_at: Time.zone.local(2026, 1, 1), ended_at: nil)

      entry = entries[cassette.id]

      expect(entry["current_bikes"].map { |b| b["name"] }).to contain_exactly("Juan Solo", "Soloist")
      expect(Time.zone.parse(entry["assigned_since"])).to eq(Time.zone.local(2026, 1, 1))
    end

    it "gives a spare its last bike, lifetime distance, rotates and latest_service (the ready inputs)" do
      chain = create(:component, user: current_user, category: "chain")
      create(:component_assignment, component: chain, bike: bike_a, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))
      create(:strava_activity, bike: bike_a, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 2_500)
      wax = current_user.service_types.find_by!(name: "wax")
      create(:maintenance_event, component: chain, service_type: wax, performed_at: Time.zone.local(2026, 2, 3))

      entry = entries[chain.id]

      expect(entry["current_bikes"]).to eq([])
      expect(entry["last_bike"]).to include("name" => "Juan Solo")
      expect(entry).to include("rotates" => true, "lifetime_distance_meters" => 2_500, "assigned_since" => nil)
      expect(entry["latest_service"]["service_type_name"]).to eq("wax")
      expect(Time.zone.parse(entry["latest_service"]["performed_at"])).to eq(Time.zone.local(2026, 2, 3))
    end

    it "marks a non-rotating category rotates false, and latest_service nil with no events" do
      saddle = create(:component, user: current_user, category: "saddle")

      expect(entries[saddle.id]).to include("rotates" => false, "latest_service" => nil)
    end

    it "keeps a retired component's lifetime distance and last bike" do
      chain = create(:component, user: current_user, category: "chain", retired_on: Date.new(2026, 3, 1))
      create(:component_assignment, component: chain, bike: bike_b, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 3, 1))
      create(:strava_activity, bike: bike_b, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 5_000)

      entry = entries[chain.id]

      expect(entry).to include("retired_on" => "2026-03-01", "lifetime_distance_meters" => 5_000)
      expect(entry["last_bike"]).to include("name" => "Soloist")
    end

    it "never leaks another user's rides, events or settings into these fields" do
      mine = create(:component, user: current_user, category: "chain")
      other_user = create(:user)
      other_bike = create(:bike, user: other_user)
      other_component = create(:component, user: other_user, category: "chain")
      create(:component_assignment, component: other_component, bike: other_bike, ended_at: nil)
      create(:strava_activity, bike: other_bike, distance_meters: 9_000)
      create(:maintenance_event, component: other_component)

      result = entries

      expect(result.keys).to eq([ mine.id ])
      expect(result[mine.id]).to include("lifetime_distance_meters" => 0, "latest_service" => nil, "current_bikes" => [])
    end
  end

  describe "last_bike" do
    let!(:juan) { create(:bike, user: current_user, name: "Juan Solo") }
    let!(:soloist) { create(:bike, user: current_user, name: "Soloist") }

    def list_entry(component)
      get "/components"
      JSON.parse(response.body).find { |c| c["id"] == component.id }
    end

    it "is null for a mounted component" do
      component = create(:component, user: current_user, category: "chain")
      create(:component_assignment, component: component, bike: juan, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))
      create(:component_assignment, component: component, bike: soloist, started_at: Time.zone.local(2026, 2, 1), ended_at: nil)

      expect(list_entry(component)["last_bike"]).to be_nil
    end

    it "is the bike of a removed component's ended assignment, with removed_at" do
      component = create(:component, user: current_user, category: "tire_front")
      removed_at = Time.zone.local(2026, 3, 1, 9, 0)
      create(:component_assignment, component: component, bike: juan, started_at: Time.zone.local(2026, 1, 1), ended_at: removed_at)

      last_bike = list_entry(component)["last_bike"]
      expect(last_bike).to include("id" => juan.id, "name" => "Juan Solo")
      expect(Time.zone.parse(last_bike["removed_at"])).to eq(removed_at)
    end

    it "is still set for a retired component" do
      component = create(:component, user: current_user, category: "tire_front", retired_on: Date.new(2026, 3, 2))
      create(:component_assignment, component: component, bike: juan, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 3, 1))

      expect(list_entry(component)["last_bike"]).to include("id" => juan.id, "name" => "Juan Solo")
    end

    it "is null for a component never installed" do
      component = create(:component, user: current_user, category: "saddle")

      expect(list_entry(component)["last_bike"]).to be_nil
    end

    it "picks the most recently ended assignment when the component has been on two bikes" do
      component = create(:component, user: current_user, category: "chain")
      create(:component_assignment, component: component, bike: soloist, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))
      create(:component_assignment, component: component, bike: juan, started_at: Time.zone.local(2026, 2, 1), ended_at: Time.zone.local(2026, 3, 1))

      expect(list_entry(component)["last_bike"]).to include("id" => juan.id, "name" => "Juan Solo")
    end

    it "is on GET /components/:id too, and null there when mounted" do
      removed = create(:component, user: current_user, category: "tire_front")
      create(:component_assignment, component: removed, bike: juan, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 3, 1))
      mounted = create(:component, user: current_user, category: "chain")
      create(:component_assignment, component: mounted, bike: soloist, ended_at: nil)

      get "/components/#{removed.id}"
      expect(JSON.parse(response.body)["last_bike"]).to include("id" => juan.id, "name" => "Juan Solo")

      get "/components/#{mounted.id}"
      expect(JSON.parse(response.body)["last_bike"]).to be_nil
    end
  end
  describe "GET /components/:id history" do
    let!(:road) { create(:bike, user: current_user, name: "Soloist") }
    let!(:trainer) { create(:bike, user: current_user, name: "Juan Solo") }

    def show(component)
      get "/components/#{component.id}"
      JSON.parse(response.body)
    end

    it "lists current and past assignments, newest first, with each stint's distance" do
      chain = create(:component, user: current_user, category: "chain")
      past = create(:component_assignment, component: chain, bike: road, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))
      current = create(:component_assignment, component: chain, bike: trainer, started_at: Time.zone.local(2026, 2, 1))
      create(:strava_activity, bike: road, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 6_000)
      create(:strava_activity, bike: trainer, moved_at: Time.zone.local(2026, 2, 10), distance_meters: 4_000)

      body = show(chain)

      expect(body["assignments"].map { |a| a["id"] }).to eq([ current.id, past.id ])
      expect(body["assignments"].first).to include("bike" => { "id" => trainer.id, "name" => "Juan Solo" }, "ended_at" => nil,
                                                   "ride_context" => "both", "distance_meters" => 4_000)
      expect(body["assignments"].last).to include("distance_meters" => 6_000)
      expect(body["assignments"].last["ended_at"]).to be_present
    end

    it "lists both bikes of a shared indoor cassette" do
      cassette = create(:component, user: current_user, category: "cassette")
      create(:component_assignment, component: cassette, bike: road, ride_context: "indoor_only")
      create(:component_assignment, component: cassette, bike: trainer, ride_context: "indoor_only")

      expect(show(cassette)["assignments"].map { |a| a.dig("bike", "name") }).to contain_exactly("Soloist", "Juan Solo")
    end

    it "includes lifetime stats, the event count and deletable" do
      chain = create(:component, user: current_user, category: "chain")
      create(:component_assignment, component: chain, bike: road, started_at: Time.zone.local(2026, 1, 1))
      create(:strava_activity, bike: road, moved_at: Time.zone.local(2026, 1, 2), distance_meters: 10_000, moving_time: 1_800,
             total_elevation_gain: 120.5, average_watts: 210, device_watts: true)
      create(:maintenance_event, component: chain, performed_at: Time.zone.local(2026, 1, 3))

      body = show(chain)

      expect(body["lifetime_stats"]).to eq("distance_meters" => 10_000, "moving_time_seconds" => 1_800,
                                           "elevation_gain_meters" => 120.5, "average_power" => 210)
      expect(body["maintenance_events_count"]).to eq(1)
      expect(body["deletable"]).to be false
      expect(body["maintenance_events"].first["component_distance_at_event_meters"]).to eq(10_000)
    end

    it "is deletable with no assignments and no events" do
      expect(show(create(:component, user: current_user))).to include("deletable" => true, "maintenance_events_count" => 0, "assignments" => [])
    end

    it "never counts another user's rides or sessions" do
      chain = create(:component, user: current_user, category: "chain")
      create(:component_assignment, component: chain, bike: road, started_at: Time.zone.local(2026, 1, 1))
      other_bike = create(:bike)
      create(:strava_activity, bike: other_bike, moved_at: Time.zone.local(2026, 1, 2), distance_meters: 50_000)
      create(:maintenance_event, component: chain, performed_at: Time.zone.local(2026, 1, 3))

      body = show(chain)

      expect(body["lifetime_stats"]["distance_meters"]).to eq(0)
      expect(body["maintenance_events"].first["component_distance_at_event_meters"]).to eq(0)
    end
  end

  describe "DELETE /components/:id" do
    it "deletes a component with no history" do
      component = create(:component, user: current_user)

      delete "/components/#{component.id}"

      expect(response).to have_http_status(:no_content)
      expect(Component.exists?(component.id)).to be false
    end

    it "refuses a component that has been installed, keeping it" do
      component = create(:component, user: current_user)
      create(:component_assignment, component: component, bike: create(:bike, user: current_user),
             started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))

      delete "/components/#{component.id}"

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"]).to eq([ Component::UNDELETABLE_MESSAGE ])
      expect(Component.exists?(component.id)).to be true
    end

    it "refuses a component with a maintenance event" do
      component = create(:component, user: current_user)
      create(:maintenance_event, component: component)

      delete "/components/#{component.id}"

      expect(response).to have_http_status(:unprocessable_content)
      expect(Component.exists?(component.id)).to be true
    end
  end

  describe "POST /components/:id/retire" do
    let!(:bike) { create(:bike, user: current_user, name: "Juan Solo") }
    let!(:chain_a) { create(:component, user: current_user, category: "chain", label: "Chain A") }
    let!(:chain_b) { create(:component, user: current_user, category: "chain", label: "Chain B") }
    let!(:assignment) { create(:component_assignment, component: chain_a, bike: bike, started_at: Time.zone.local(2026, 1, 1)) }
    let(:at) { "2026-03-01T23:30:00Z" } # 15:30 in Vancouver

    it "retires and replaces, returning the component and both assignments" do
      post "/components/#{chain_a.id}/retire", params: { at: at, replacement_component_id: chain_b.id, tz: "America/Vancouver" }

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["component"]).to include("id" => chain_a.id, "retired_on" => "2026-03-01")
      expect(body["ended_assignments"].map { |a| a["id"] }).to eq([ assignment.id ])
      expect(body["new_assignment"]).to include("component_id" => chain_b.id, "bike_id" => bike.id)
      expect(Time.zone.parse(body["new_assignment"]["started_at"])).to eq(Time.zone.parse(at))
    end

    it "retires without a replacement, with a null new_assignment" do
      post "/components/#{chain_a.id}/retire", params: { at: at, tz: "America/Vancouver" }

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["new_assignment"]).to be_nil
      expect(assignment.reload.ended_at).to eq(Time.zone.parse(at))
    end

    it "returns 422 with base errors for an invalid request" do
      post "/components/#{chain_a.id}/retire", params: { at: "2025-12-01T00:00:00Z" }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].first).to include("must be after its installation")
    end

    it "404s for another user's component" do
      other = create(:component, category: "chain")

      post "/components/#{other.id}/retire", params: { at: at }

      expect(response).to have_http_status(:not_found)
      expect(other.reload.retired_on).to be_nil
    end

    it "404s for another user's replacement, changing nothing" do
      other = create(:component, category: "chain")

      post "/components/#{chain_a.id}/retire", params: { at: at, replacement_component_id: other.id }

      expect(response).to have_http_status(:not_found)
      expect(assignment.reload.ended_at).to be_nil
      expect(chain_a.reload.retired_on).to be_nil
    end
  end
end
