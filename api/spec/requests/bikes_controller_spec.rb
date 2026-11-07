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

    it "404s on GET /bikes/:id/rides for another user's bike" do
      other_bike = create(:bike)

      get "/bikes/#{other_bike.id}/rides"

      expect(response).to have_http_status(:not_found)
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

    it "adds each row's brand to its category's common_brands" do
      bike = create(:bike, user: current_user)

      post "/bikes/#{bike.id}/component_setup", params: {
        installed_on: "2026-01-01",
        components: [
          { category: "chain", label: "Chain A", brand: "Rene Herse" },
          { category: "fenders", label: "Fender A", brand: "SKS" },
        ],
      }

      expect(response).to have_http_status(:created)
      expect(current_user.component_category_settings.find_by(category: "chain").common_brands).to include("Rene Herse")
      expect(current_user.component_category_settings.find_by(category: "fenders").common_brands).to eq(%w[SKS])
    end

    it "adds nothing when the batch is rolled back" do
      bike = create(:bike, user: current_user)
      chain_setting = current_user.component_category_settings.find_by!(category: "chain")
      original_brands = chain_setting.common_brands

      post "/bikes/#{bike.id}/component_setup", params: {
        installed_on: "2026-01-01",
        components: [
          { category: "chain", label: "Chain A", brand: "Rene Herse" },
          { category: "cassette", label: "" }, # blank label fails Component's presence validation
        ],
      }

      expect(response).to have_http_status(:unprocessable_content)
      expect(chain_setting.reload.common_brands).to eq(original_brands)
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

  describe "GET /bikes/:id/rides" do
    it "returns ride shape and values, preserving nulls rather than coercing to 0" do
      bike = create(:bike, user: current_user)
      ride = create(:strava_activity,
        user: current_user, bike: bike, strava_id: 555, name: "Morning Ride", activity_type: "Ride",
        trainer: false, moved_at: Time.zone.local(2026, 1, 1, 8, 0), distance_meters: 32_000,
        moving_time: 5400, elapsed_time: nil, total_elevation_gain: nil,
        average_speed: nil, max_speed: nil, average_watts: nil, weighted_average_watts: nil,
        device_watts: nil, kilojoules: nil, average_heartrate: nil, max_heartrate: nil, average_cadence: nil,
      )

      get "/bikes/#{bike.id}/rides"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      row = body["rides"].first
      expect(row["id"]).to eq(ride.id)
      expect(row["strava_id"]).to eq(555)
      expect(row["name"]).to eq("Morning Ride")
      expect(row["activity_type"]).to eq("Ride")
      expect(row["ride_kind"]).to eq("outdoor")
      expect(row["distance_meters"]).to eq(32_000)
      expect(row["cumulative_distance_meters"]).to eq(32_000)
      expect(row["moving_time"]).to eq(5400)
      expect(row["elapsed_time"]).to be_nil
      expect(row["total_elevation_gain"]).to be_nil
      expect(row["average_watts"]).to be_nil
      expect(row["device_watts"]).to be_nil
      expect(row["counted_toward"]).to eq([])
      expect(body["meta"]).to eq(
        "total_count" => 1, "total_distance_meters" => 32_000, "page" => 1, "per_page" => 50, "next_page" => nil,
      )
    end

    it "computes cumulative_distance_meters correctly on page 2, in both orders" do
      bike = create(:bike, user: current_user)
      rides = (1..7).map do |n|
        create(:strava_activity, user: current_user, bike: bike, moved_at: n.days.ago, distance_meters: 1_000 * n)
      end
      chronological = rides.sort_by(&:moved_at)
      expected_cumulative = {}
      running = 0
      chronological.each { |r| running += r.distance_meters; expected_cumulative[r.id] = running }

      get "/bikes/#{bike.id}/rides", params: { order: "desc", page: 2, per_page: 3 }
      desc_page2 = JSON.parse(response.body)["rides"]
      desc_page2.each { |row| expect(row["cumulative_distance_meters"]).to eq(expected_cumulative[row["id"]]) }

      get "/bikes/#{bike.id}/rides", params: { order: "asc", page: 2, per_page: 3 }
      asc_page2 = JSON.parse(response.body)["rides"]
      asc_page2.each { |row| expect(row["cumulative_distance_meters"]).to eq(expected_cumulative[row["id"]]) }
    end

    it "keeps cumulative_distance_meters as the full-bike odometer even with an indoor/outdoor filter active" do
      bike = create(:bike, user: current_user)
      create(:strava_activity, user: current_user, bike: bike, moved_at: 3.days.ago, distance_meters: 10_000, trainer: false, activity_type: "Ride")
      indoor_ride = create(:strava_activity, user: current_user, bike: bike, moved_at: 2.days.ago, distance_meters: 20_000, trainer: true, activity_type: "Ride")
      create(:strava_activity, user: current_user, bike: bike, moved_at: 1.day.ago, distance_meters: 30_000, trainer: false, activity_type: "Ride")

      get "/bikes/#{bike.id}/rides", params: { type: "indoor" }

      body = JSON.parse(response.body)
      expect(body["rides"].map { |r| r["id"] }).to eq([indoor_ride.id])
      expect(body["rides"].first["cumulative_distance_meters"]).to eq(30_000) # full-bike total through that point, not just indoor
      expect(body["meta"]["total_count"]).to eq(1)
      expect(body["meta"]["total_distance_meters"]).to eq(20_000) # the filtered total, not the odometer
    end

    it "the newest ride's cumulative_distance_meters equals Bike#total_distance" do
      bike = create(:bike, user: current_user)
      4.times { |i| create(:strava_activity, user: current_user, bike: bike, distance_meters: 5_000, moved_at: i.days.ago) }

      get "/bikes/#{bike.id}/rides"

      newest = JSON.parse(response.body)["rides"].first
      expect(newest["cumulative_distance_meters"]).to eq(bike.reload.total_distance)
    end

    it "tie-breaks on id when moved_at is equal" do
      bike = create(:bike, user: current_user)
      same_time = Time.zone.local(2026, 1, 1, 9, 0)
      first = create(:strava_activity, user: current_user, bike: bike, moved_at: same_time, distance_meters: 1_000)
      second = create(:strava_activity, user: current_user, bike: bike, moved_at: same_time, distance_meters: 2_000)

      get "/bikes/#{bike.id}/rides", params: { order: "asc" }

      rides = JSON.parse(response.body)["rides"]
      sorted_ids = [first.id, second.id].sort
      expect(rides.map { |r| r["id"] }).to eq(sorted_ids)
      # The lower id is the window's tie-break winner, so it comes first
      # chronologically and its cumulative is only its own distance; the
      # higher id follows with both distances summed.
      lower_id_ride = first.id < second.id ? first : second
      higher_id_ride = first.id < second.id ? second : first
      lower_row = rides.find { |r| r["id"] == lower_id_ride.id }
      higher_row = rides.find { |r| r["id"] == higher_id_ride.id }
      expect(lower_row["cumulative_distance_meters"]).to eq(lower_id_ride.distance_meters)
      expect(higher_row["cumulative_distance_meters"]).to eq(lower_id_ride.distance_meters + higher_id_ride.distance_meters)
    end

    it "sets ride_kind for outdoor, trainer, virtual, and virtual-without-trainer" do
      bike = create(:bike, user: current_user)
      outdoor = create(:strava_activity, user: current_user, bike: bike, trainer: false, activity_type: "Ride", moved_at: 4.days.ago)
      trainer = create(:strava_activity, user: current_user, bike: bike, trainer: true, activity_type: "Ride", moved_at: 3.days.ago)
      virtual_with_trainer = create(:strava_activity, user: current_user, bike: bike, trainer: true, activity_type: "VirtualRide", moved_at: 2.days.ago)
      virtual_without_trainer = create(:strava_activity, user: current_user, bike: bike, trainer: false, activity_type: "VirtualRide", moved_at: 1.day.ago)

      get "/bikes/#{bike.id}/rides"

      kinds = JSON.parse(response.body)["rides"].index_by { |r| r["id"] }.transform_values { |r| r["ride_kind"] }
      expect(kinds[outdoor.id]).to eq("outdoor")
      expect(kinds[trainer.id]).to eq("trainer")
      expect(kinds[virtual_with_trainer.id]).to eq("virtual")
      expect(kinds[virtual_without_trainer.id]).to eq("virtual")
    end

    it "includes counted_toward for a split indoor/outdoor cassette slot" do
      bike = create(:bike, user: current_user)
      ComponentCategorySetting.find_or_initialize_by(user: current_user, category: "cassette")
        .update!(allows_multiple_assignments: true)
      create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "outdoor_only")
      create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "indoor_only")
      outdoor_cassette = create(:component, user: current_user, category: "cassette", label: "Road cassette")
      indoor_cassette = create(:component, user: current_user, category: "cassette", label: "Trainer cassette")
      create(:component_assignment, component: outdoor_cassette, bike: bike, ride_context: "outdoor_only", started_at: 10.days.ago)
      create(:component_assignment, component: indoor_cassette, bike: bike, ride_context: "indoor_only", started_at: 10.days.ago)

      outdoor_ride = create(:strava_activity, user: current_user, bike: bike, trainer: false, activity_type: "Ride", moved_at: 2.days.ago)
      indoor_ride = create(:strava_activity, user: current_user, bike: bike, trainer: true, activity_type: "Ride", moved_at: 1.day.ago)

      get "/bikes/#{bike.id}/rides"

      rides = JSON.parse(response.body)["rides"].index_by { |r| r["id"] }
      expect(rides[outdoor_ride.id]["counted_toward"]).to eq([{ "component_id" => outdoor_cassette.id, "label" => "Road cassette" }])
      expect(rides[indoor_ride.id]["counted_toward"]).to eq([{ "component_id" => indoor_cassette.id, "label" => "Trainer cassette" }])
    end
  end
end
