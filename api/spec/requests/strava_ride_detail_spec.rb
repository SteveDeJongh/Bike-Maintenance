require "rails_helper"

RSpec.describe "GET /strava/rides/:id", type: :request do
  let!(:current_user) { create(:user) }
  let!(:bike) { create(:bike, user: current_user, name: "Juan Solo", strava_gear_id: "b123") }
  let(:moved_at) { Time.zone.local(2026, 3, 10, 9, 0) }
  let(:installed) { Time.zone.local(2026, 1, 1) }

  before { sign_in(current_user) }

  def detail(ride)
    get "/strava/rides/#{ride.id}"
    expect(response).to have_http_status(:ok)
    JSON.parse(response.body)
  end

  it "returns identity and every stored metric, passing nulls through" do
    ride = create(:strava_activity, user: current_user, bike: bike, moved_at: moved_at, name: "Gravel loop",
      activity_type: "GravelRide", gear_id: "b123", distance_meters: 42_000, moving_time: 5_400, elapsed_time: 6_000,
      total_elevation_gain: 512.5, average_speed: 7.8, max_speed: 15.2, average_watts: 180.5,
      weighted_average_watts: 195, device_watts: true, kilojoules: 974.7, average_heartrate: nil,
      max_heartrate: nil, average_cadence: nil)

    body = detail(ride)

    expect(body).to include(
      "id" => ride.id, "strava_id" => ride.strava_id, "name" => "Gravel loop", "activity_type" => "GravelRide",
      "indoor" => false, "trainer" => false, "commute" => false, "ride_kind" => "outdoor",
      "bike" => { "id" => bike.id, "name" => "Juan Solo" }, "gear_id" => "b123", "gear_mapped" => true, "reason" => nil,
      "distance_meters" => 42_000, "moving_time" => 5_400, "elapsed_time" => 6_000, "total_elevation_gain" => 512.5,
      "average_speed" => 7.8, "max_speed" => 15.2, "average_watts" => 180.5, "weighted_average_watts" => 195,
      "device_watts" => true, "kilojoules" => 974.7,
      "average_heartrate" => nil, "max_heartrate" => nil, "average_cadence" => nil,
    )
    expect(Time.zone.parse(body["moved_at"])).to eq(moved_at)
  end

  it "reads a VirtualRide as indoor" do
    ride = create(:strava_activity, user: current_user, bike: bike, activity_type: "VirtualRide")
    expect(detail(ride)).to include("indoor" => true, "ride_kind" => "virtual")
  end

  describe "gear" do
    it "is unmapped when the ride has gear no bike claims" do
      ride = create(:strava_activity, user: current_user, bike: nil, gear_id: "g999")
      expect(detail(ride)).to include("bike" => nil, "gear_id" => "g999", "gear_mapped" => false, "reason" => "unmapped_gear")
    end

    it "has no gear at all" do
      ride = create(:strava_activity, user: current_user, bike: nil, gear_id: nil)
      expect(detail(ride)).to include("bike" => nil, "gear_id" => nil, "gear_mapped" => false, "reason" => "no_gear")
    end
  end

  describe "components" do
    let(:outdoor_cassette) { create(:component, user: current_user, category: "cassette", label: "Road cassette") }
    let(:indoor_cassette) { create(:component, user: current_user, category: "cassette", label: "Trainer cassette") }
    let(:chain) { create(:component, user: current_user, category: "chain", label: "Chain A") }

    before do
      create(:component_assignment, bike: bike, component: outdoor_cassette, started_at: installed, ride_context: "outdoor_only")
      create(:component_assignment, bike: bike, component: indoor_cassette, started_at: installed, ride_context: "indoor_only")
      create(:component_assignment, bike: bike, component: chain, started_at: installed)
    end

    it "matches CountedTowardQuery for the indoor/outdoor split cassette" do
      outdoor = create(:strava_activity, user: current_user, bike: bike, moved_at: moved_at)
      indoor = create(:strava_activity, user: current_user, bike: bike, moved_at: moved_at + 1.day, trainer: true)

      [ outdoor, indoor ].each do |ride|
        expected = Maintenance::CountedTowardQuery.call(current_user, activity_ids: [ ride.id ])[ride.id].map { |c| c[:component_id] }
        expect(detail(ride)["components"].map { |c| c["component_id"] }).to match_array(expected)
      end
      expect(detail(outdoor)["components"].map { |c| c["label"] }).to eq([ "Chain A", "Road cassette" ])
      expect(detail(indoor)["components"].map { |c| c["label"] }).to eq([ "Chain A", "Trainer cassette" ])
    end

    it "gives a component with a requirement its wear fields, and one without its lifetime distance" do
      wax = current_user.service_types.find_by!(name: "wax")
      create(:component_service_requirement, component: chain, service_type: wax, distance_interval_meters: 20_000)
      ride = create(:strava_activity, user: current_user, bike: bike, moved_at: moved_at, distance_meters: 25_000)

      by_label = detail(ride)["components"].index_by { |c| c["label"] }

      expect(by_label["Chain A"]).to include(
        "component_id" => chain.id, "category" => "chain", "service_status" => "due", "fraction_used" => 1.25,
        "driving_dimension" => "distance", "distance_remaining_meters" => -5_000, "total_distance_meters" => nil,
      )
      expect(by_label["Road cassette"]).to include(
        "service_status" => nil, "fraction_used" => nil, "total_distance_meters" => 25_000,
      )
    end
  end

  describe "service_nearby" do
    def session_at(time, items: 1)
      session = create(:service_session, bike: bike, user: current_user, performed_at: time)
      component = create(:component, user: current_user, category: "chain")
      items.times do
        create(:maintenance_event, component: component, service_session: session, performed_at: time)
      end
      session
    end

    it "lists the latest session at or before the ride, then sessions up to the bike's next ride" do
      session_at(moved_at - 5.days)
      before = session_at(moved_at - 1.day, items: 2)
      ride = create(:strava_activity, user: current_user, bike: bike, moved_at: moved_at)
      after = session_at(moved_at + 2.hours)
      create(:strava_activity, user: current_user, bike: bike, moved_at: moved_at + 1.day)
      session_at(moved_at + 2.days) # after the next ride: excluded

      nearby = detail(ride)["service_nearby"]

      expect(nearby.map { |s| [ s["id"], s["position"] ] }).to eq([ [ before.id, "before" ], [ after.id, "after" ] ])
      expect(nearby.first["summary"]).to eq("Service · 2 items on Juan Solo")
    end

    it "is empty when the ride has no bike" do
      ride = create(:strava_activity, user: current_user, bike: nil, moved_at: moved_at)
      expect(detail(ride)["service_nearby"]).to eq([])
    end
  end

  it "404s for another user's ride" do
    other = create(:strava_activity)

    get "/strava/rides/#{other.id}"

    expect(response).to have_http_status(:not_found)
  end
end
