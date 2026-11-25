require "rails_helper"

RSpec.describe "Activity", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /activity" do
    it "returns a ride item in Strava::RideSerialization shape plus attribution/reason/counted_toward, no cumulative_distance_meters" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain", label: "Chain A")
      create(:component_assignment, component: component, bike: bike, started_at: 2.days.ago, ended_at: nil)
      ride = create(:strava_activity, user: current_user, bike: bike, moved_at: 1.day.ago)

      get "/activity"

      item = JSON.parse(response.body)["items"].first
      expect(item["kind"]).to eq("ride")
      expect(item["id"]).to eq(ride.id)
      expect(item["bike"]).to eq("id" => bike.id, "name" => bike.name)
      expect(item["attribution"]).to eq("attributed")
      expect(item["counted_toward"]).to eq([ { "component_id" => component.id, "label" => "Chain A" } ])
      expect(item).not_to have_key("cumulative_distance_meters")
    end

    it "returns a service_session item inline, with its items" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain", label: "Chain A")
      service_type = current_user.service_types.find_by!(name: "wax")
      session = create(:service_session, bike: bike, user: current_user, performed_at: 1.day.ago)
      create(:maintenance_event, component: component, service_type: service_type, service_session: session, performed_at: 1.day.ago)

      get "/activity", params: { kinds: [ "service" ] }

      item = JSON.parse(response.body)["items"].first
      expect(item["kind"]).to eq("service_session")
      expect(item["item_count"]).to eq(1)
      expect(item["items"].first).to include("component_id" => component.id, "label" => "Chain A", "service_type_name" => "wax")
      expect(item["summary"]).to eq("Service · 1 item on #{bike.name}")
    end

    it "returns a session-less maintenance_event item" do
      component = create(:component, user: current_user, category: "chain", label: "Chain A")
      service_type = current_user.service_types.find_by!(name: "wax")
      event = create(:maintenance_event, component: component, service_type: service_type, performed_at: 1.day.ago)

      get "/activity", params: { kinds: [ "service" ] }

      item = JSON.parse(response.body)["items"].first
      expect(item["kind"]).to eq("maintenance_event")
      expect(item["id"]).to eq(event.id)
      expect(item["summary"]).to eq("Chain A · wax")
    end

    it "returns a setup_change item" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain", label: "Chain A")
      assignment = create(:component_assignment, component: component, bike: bike, started_at: 1.day.ago)

      get "/activity", params: { kinds: [ "setup" ] }

      item = JSON.parse(response.body)["items"].first
      expect(item["kind"]).to eq("setup_change")
      expect(item["id"]).to eq(assignment.id)
      expect(item["action"]).to eq("installed")
      expect(item["component"]).to eq("id" => component.id, "label" => "Chain A")
    end

    it "keeps only entries strictly before ?before=, an instant -- the component's last counted ride" do
      bike = create(:bike, user: current_user)
      chain = create(:component, user: current_user)
      create(:component_assignment, component: chain, bike: bike, started_at: Time.utc(2026, 1, 1))
      earlier = create(:strava_activity, user: current_user, bike: bike, moved_at: Time.utc(2026, 3, 1, 8), name: "Hill repeats")
      at_instant = create(:strava_activity, user: current_user, bike: bike, moved_at: Time.utc(2026, 3, 1, 10))
      create(:strava_activity, user: current_user, bike: bike, moved_at: Time.utc(2026, 3, 1, 12))

      get "/activity", params: { kinds: [ "ride" ], component_id: chain.id, before: "2026-03-01T10:00:00Z", per_page: 1 }

      body = JSON.parse(response.body)
      expect(body["items"].map { |i| i["id"] }).to eq([ earlier.id ])
      expect(body["items"].first).to include("name" => "Hill repeats", "elapsed_time" => earlier.elapsed_time)
      expect(at_instant.id).not_to eq(earlier.id)

      get "/activity", params: { kinds: [ "ride" ], before: "not a time" }
      expect(JSON.parse(response.body)["items"].size).to eq(3)
    end

    it "includes meta.week_totals keyed by the local Monday for a date-ordered page" do
      bike = create(:bike, user: current_user)
      create(:strava_activity, user: current_user, bike: bike, moved_at: ActiveSupport::TimeZone["America/Vancouver"].parse("2026-03-15 23:30"), distance_meters: 3_000)

      get "/activity", params: { tz: "America/Vancouver" }

      week_totals = JSON.parse(response.body)["meta"]["week_totals"]
      expect(week_totals.keys).to eq([ "2026-03-09" ]) # Sunday 23:30 local
      expect(week_totals["2026-03-09"]).to include("ride_count" => 1, "distance_meters" => 3_000)
    end

    it "lists rides only for a metric sort, whatever kinds asked for, and says so with rides_only" do
      bike = create(:bike, user: current_user)
      create(:strava_activity, user: current_user, bike: bike, moved_at: 1.day.ago)
      create(:service_session, bike: bike, user: current_user, performed_at: 1.day.ago)

      get "/activity", params: { kinds: [ "ride", "service" ], sort: "average_watts" }

      body = JSON.parse(response.body)
      expect(response).to have_http_status(:ok)
      expect(body["rides_only"]).to be true
      expect(body["items"].map { |i| i["kind"] }).to eq([ "ride" ])
      expect(body["meta"]).not_to have_key("week_totals")
    end

    it "reports rides_only false for date order" do
      get "/activity"

      expect(JSON.parse(response.body)["rides_only"]).to be false
    end

    it "responds 422 for an unknown sort key" do
      get "/activity", params: { sort: "name; DROP TABLE strava_activities" }

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["base"].first).to include("Unknown sort")
    end

    describe "cross-account isolation" do
      it "never includes another user's rides, service entries, or setup changes" do
        other_bike = create(:bike)
        other_component = create(:component, user: other_bike.user, category: "chain")
        create(:strava_activity, user: other_bike.user, bike: other_bike, moved_at: 1.day.ago)
        create(:maintenance_event, component: other_component, performed_at: 1.day.ago)
        create(:component_assignment, component: other_component, bike: other_bike, started_at: 1.day.ago)

        get "/activity", params: { kinds: %w[ride service setup] }

        expect(JSON.parse(response.body)["items"]).to eq([])
      end
    end
  end
end
