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

  describe "POST /bikes" do
    it "accepts acquired_on" do
      post "/bikes", params: { bike: { name: "Soloist", acquired_on: "2026-01-01" } }

      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)["acquired_on"]).to eq("2026-01-01")
    end

    it "rejects an acquired_on after retired_on" do
      post "/bikes", params: { bike: { name: "Soloist", acquired_on: "2026-06-01", retired_on: "2026-01-01" } }

      expect(response).to have_http_status(:unprocessable_content)
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

  describe "POST /bikes/:id/component_setup" do
    it "creates a slot, component, and assignment per row, with each row's own ride_context" do
      bike = create(:bike, user: current_user)

      post "/bikes/#{bike.id}/component_setup", params: {
        installed_on: "2026-01-01",
        components: [
          { category: "chain", label: "Chain A", ride_context: "both", brand: "Shimano", model: "105", notes: "Waxed" },
          { category: "cassette", label: "Cassette A", ride_context: "outdoor_only" },
        ],
      }

      expect(response).to have_http_status(:created)
      expect(bike.bike_component_slots.pluck(:category, :ride_context)).to contain_exactly(
        [ "chain", "both" ], [ "cassette", "outdoor_only" ],
      )

      chain = current_user.components.find_by!(label: "Chain A")
      expect(chain.category).to eq("chain")
      expect(chain.acquired_on).to eq(Date.new(2026, 1, 1))
      expect(chain.brand).to eq("Shimano")
      expect(chain.model).to eq("105")
      expect(chain.notes).to eq("Waxed")
      chain_assignment = chain.component_assignments.first
      expect(chain_assignment.bike_id).to eq(bike.id)
      expect(chain_assignment.started_at).to eq(Time.zone.parse("2026-01-01"))
      expect(chain_assignment.ride_context).to eq("both")

      cassette = current_user.components.find_by!(label: "Cassette A")
      expect(cassette.component_assignments.first.ride_context).to eq("outdoor_only")
    end

    it "defaults a row's ride_context to both when omitted" do
      bike = create(:bike, user: current_user)

      post "/bikes/#{bike.id}/component_setup", params: {
        installed_on: "2026-01-01",
        components: [ { category: "chain", label: "Chain A" } ],
      }

      expect(response).to have_http_status(:created)
      expect(bike.bike_component_slots.first.ride_context).to eq("both")
    end

    it "sets up two components of the same allows_multiple_assignments category with different ride contexts" do
      bike = create(:bike, user: current_user)

      post "/bikes/#{bike.id}/component_setup", params: {
        installed_on: "2026-01-01",
        components: [
          { category: "cassette", label: "Road Cassette", ride_context: "outdoor_only" },
          { category: "cassette", label: "Trainer Cassette", ride_context: "indoor_only" },
        ],
      }

      expect(response).to have_http_status(:created)
      expect(bike.bike_component_slots.where(category: "cassette").pluck(:ride_context))
        .to contain_exactly("outdoor_only", "indoor_only")
      expect(current_user.components.where(category: "cassette").count).to eq(2)
    end

    it "fails the row honestly, via the real slot validation, when a split ride_context isn't allowed for that category" do
      bike = create(:bike, user: current_user)

      post "/bikes/#{bike.id}/component_setup", params: {
        installed_on: "2026-01-01",
        components: [ { category: "chain", label: "Chain A", ride_context: "outdoor_only" } ],
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["row_errors"]["0"]).to be_present
      expect(current_user.components.count).to eq(0)
    end

    it "rolls back everything when one row fails validation, keying the error by row index" do
      bike = create(:bike, user: current_user)

      post "/bikes/#{bike.id}/component_setup", params: {
        installed_on: "2026-01-01",
        components: [
          { category: "chain", label: "Chain A" },
          { category: "cassette", label: "" }, # blank label fails Component's presence validation
        ],
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["row_errors"].keys).to eq(["1"])
      expect(bike.bike_component_slots.count).to eq(0)
      expect(current_user.components.count).to eq(0)
    end

    it "fails the row honestly, via the real slot uniqueness validation, when the bike already has a slot for that category" do
      bike = create(:bike, user: current_user)
      create(:bike_component_slot, bike: bike, category: "chain", ride_context: "both")

      post "/bikes/#{bike.id}/component_setup", params: {
        installed_on: "2026-01-01",
        components: [ { category: "chain", label: "Chain A" } ],
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["row_errors"]["0"]).to be_present
      expect(current_user.components.count).to eq(0)
    end

    it "404s for another user's bike" do
      other_bike = create(:bike)

      post "/bikes/#{other_bike.id}/component_setup", params: { installed_on: "2026-01-01", components: [] }

      expect(response).to have_http_status(:not_found)
    end
  end
end
