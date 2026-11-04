require "rails_helper"

RSpec.describe "Dashboard", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /dashboard" do
    describe "sync" do
      it "reports disconnected with no credential" do
        get "/dashboard"

        sync = JSON.parse(response.body)["sync"]
        expect(sync["connected"]).to be false
        expect(sync["last_synced_at"]).to be_nil
      end

      it "reports connected, last_synced_at, and the total ride count" do
        create(:strava_credential, user: current_user, last_synced_at: Time.zone.local(2026, 11, 4, 9, 0))
        bike = create(:bike, user: current_user)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 11, 1))

        get "/dashboard"

        sync = JSON.parse(response.body)["sync"]
        expect(sync["connected"]).to be true
        expect(sync["last_synced_at"]).to eq("2026-11-04T09:00:00.000Z")
        expect(sync["rides_total"]).to eq(1)
      end

      it "splits unattributed rides into gear-present-but-unmapped and no-gear-at-all" do
        create(:strava_activity, user: current_user, bike: nil, gear_id: "g1", distance_meters: 10_000)
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil, distance_meters: 5_000)
        attributed_bike = create(:bike, user: current_user)
        create(:strava_activity, user: current_user, bike: attributed_bike, distance_meters: 1_000)

        get "/dashboard"

        unattributed = JSON.parse(response.body)["sync"]["unattributed"]
        expect(unattributed["count"]).to eq(2)
        expect(unattributed["distance_meters"]).to eq(15_000)
        expect(unattributed["with_gear"]).to eq("count" => 1, "distance_meters" => 10_000)
        expect(unattributed["without_gear"]).to eq("count" => 1, "distance_meters" => 5_000)
      end

      it "sources unmapped_gear_count from the same place as /strava/unmapped_gear" do
        create(:strava_gear, user: current_user, strava_gear_id: "g1")
        create(:bike, user: current_user, strava_gear_id: "g2")
        create(:strava_gear, user: current_user, strava_gear_id: "g2")

        get "/dashboard"

        expect(JSON.parse(response.body)["sync"]["unattributed"]["unmapped_gear_count"]).to eq(1)
      end
    end

    describe "bikes" do
      it "excludes retired bikes" do
        create(:bike, user: current_user, retired_on: Date.current)
        active = create(:bike, user: current_user)

        get "/dashboard"

        ids = JSON.parse(response.body)["bikes"].map { |b| b["id"] }
        expect(ids).to eq([ active.id ])
      end

      it "includes total_distance, ride_count, and last_ride_on" do
        bike = create(:bike, user: current_user)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 10, 1), distance_meters: 10_000)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 10, 15), distance_meters: 20_000)

        get "/dashboard"

        payload = JSON.parse(response.body)["bikes"].first
        expect(payload["total_distance"]).to eq(30_000)
        expect(payload["ride_count"]).to eq(2)
        expect(payload["last_ride_on"]).to eq("2026-10-15T00:00:00.000Z")
      end

      it "computes distance_this_month using the current calendar month in the given tz, defaulting to UTC" do
        travel_to Time.utc(2026, 11, 4, 12, 0) do
          bike = create(:bike, user: current_user)
          # Nov 1 03:00 UTC = Oct 31 20:00 in America/Phoenix (UTC-7, no DST)
          # -- still October there, even though it's already November in UTC.
          create(:strava_activity, user: current_user, bike: bike, moved_at: Time.utc(2026, 11, 1, 3, 0), distance_meters: 1_000)
          # Nov 1 08:00 UTC = Nov 1 01:00 in America/Phoenix -- November there too.
          create(:strava_activity, user: current_user, bike: bike, moved_at: Time.utc(2026, 11, 1, 8, 0), distance_meters: 2_000)

          get "/dashboard", params: { tz: "America/Phoenix" }
          expect(JSON.parse(response.body)["bikes"].first["distance_this_month"]).to eq(2_000)

          get "/dashboard" # no tz param -> defaults to UTC, where both rides are already in November
          expect(JSON.parse(response.body)["bikes"].first["distance_this_month"]).to eq(3_000)
        end
      end

      it "lists currently-mounted components with their service_status and display_metric" do
        bike = create(:bike, user: current_user)
        component = create(:component, user: current_user, category: "chain", label: "Chain A")
        service_type = current_user.service_types.find_by!(name: "wax")
        create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil,
          ride_context: "outdoor_only")
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_200)

        get "/dashboard"

        mounted = JSON.parse(response.body)["bikes"].first["mounted"].first
        expect(mounted["component_id"]).to eq(component.id)
        expect(mounted["label"]).to eq("Chain A")
        expect(mounted["ride_context"]).to eq("outdoor_only")
        expect(mounted["service_status"]).to eq("due")
        expect(mounted["display_metric"]).to eq(
          "service_type_name" => "wax", "distance_meters" => 1_200, "days" => nil,
        )
      end

      it "falls back to total_distance with a nil service_type_name when the component has no enabled interval" do
        bike = create(:bike, user: current_user)
        component = create(:component, user: current_user, category: "saddle")
        create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 500)

        get "/dashboard"

        mounted = JSON.parse(response.body)["bikes"].first["mounted"].first
        expect(mounted["display_metric"]).to eq(
          "service_type_name" => nil, "distance_meters" => 500, "days" => nil,
        )
      end

      it "lists off_bike components whose most recent assignment was on this bike" do
        bike = create(:bike, user: current_user)
        other_bike = create(:bike, user: current_user)
        chain_a = create(:component, user: current_user, category: "chain", label: "Chain A")
        chain_b = create(:component, user: current_user, category: "chain", label: "Chain B")
        # Chain A is currently mounted on the bike (not off_bike anywhere).
        create(:component_assignment, component: chain_a, bike: bike, started_at: Time.zone.local(2026, 2, 1), ended_at: nil)
        # Chain B's most recent (ended) assignment was on this same bike --
        # ended before Chain A's start (not exactly adjacent), avoiding the
        # same-category overlap validation on the same bike.
        create(:component_assignment, component: chain_b, bike: bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 1, 31))
        # Its most recent assignment overall was on other_bike -- should NOT show as off this bike.
        chain_c = create(:component, user: current_user, category: "chain", label: "Chain C")
        create(:component_assignment, component: chain_c, bike: other_bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 1, 15))

        get "/dashboard"

        off_bike_labels = JSON.parse(response.body)["bikes"].find { |b| b["id"] == bike.id }["off_bike"].map { |c| c["label"] }
        expect(off_bike_labels).to eq([ "Chain B" ])
      end

      it "excludes a retired component from off_bike" do
        bike = create(:bike, user: current_user)
        component = create(:component, user: current_user, category: "chain", retired_on: Date.current)
        create(:component_assignment, component: component, bike: bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))

        get "/dashboard"

        expect(JSON.parse(response.body)["bikes"].first["off_bike"]).to eq([])
      end
    end

    describe "attention" do
      def due_component(bike:, label: "Chain A")
        component = create(:component, user: current_user, category: "chain", label: label)
        service_type = current_user.service_types.find_by!(name: "wax")
        create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)
        component
      end

      it "includes a due interval, excludes an ok one" do
        bike = create(:bike, user: current_user)
        due = due_component(bike: bike)
        ok_component = create(:component, user: current_user, category: "saddle")
        ok_type = current_user.service_types.find_by!(name: "inspect")
        create(:component_service_interval, component: ok_component, service_type: ok_type, distance_interval_meters: 1_000_000)
        create(:component_assignment, component: ok_component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)

        get "/dashboard"

        attention = JSON.parse(response.body)["attention"]
        expect(attention.map { |a| a["component_id"] }).to eq([ due.id ])
        expect(attention.first["status"]).to eq("due")
        expect(attention.first["bike"]).to eq("id" => bike.id, "name" => bike.name)
        expect(attention.first["mounted"]).to be true
      end

      it "excludes a retired component even if its interval is due" do
        bike = create(:bike, user: current_user)
        component = due_component(bike: bike)
        component.update!(retired_on: Date.current)

        get "/dashboard"

        expect(JSON.parse(response.body)["attention"]).to eq([])
      end

      it "still includes a dismissed interval, flagged, not hidden" do
        bike = create(:bike, user: current_user)
        component = due_component(bike: bike)
        interval = component.component_service_intervals.first
        create(:service_alert_dismissal, component_service_interval: interval, dismissed_status: "due", dismissed_at: Time.current)

        get "/dashboard"

        item = JSON.parse(response.body)["attention"].first
        expect(item["dismissed"]).to be true
      end

      it "still includes a notifications-off interval, flagged, not hidden" do
        bike = create(:bike, user: current_user)
        component = due_component(bike: bike)
        current_user.component_category_settings.find_by!(category: "chain").update!(notifications_enabled: false)

        get "/dashboard"

        item = JSON.parse(response.body)["attention"].first
        expect(item["notifications_off"]).to be true
      end

      it "flags an unmounted component's interval, with a null bike" do
        bike = create(:bike, user: current_user)
        component = due_component(bike: bike)
        component.component_assignments.update_all(ended_at: Time.current)

        get "/dashboard"

        item = JSON.parse(response.body)["attention"].first
        expect(item["mounted"]).to be false
        expect(item["bike"]).to be_nil
      end

      it "orders due before warning, then by fraction used descending" do
        bike = create(:bike, user: current_user)
        due = due_component(bike: bike, label: "Due Chain")

        warning_component = create(:component, user: current_user, category: "cassette", label: "Warning Component")
        warning_type = current_user.service_types.find_by!(name: "inspect")
        create(:component_service_interval, component: warning_component, service_type: warning_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: warning_component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 960)

        get "/dashboard"

        labels = JSON.parse(response.body)["attention"].map { |a| a["component_label"] }
        expect(labels).to eq([ "Due Chain", "Warning Component" ])
      end
    end

    describe "recent_rides" do
      it "includes rides from the last 14 days, with the summary count/distance and the bike it's attributed to" do
        travel_to Time.zone.local(2026, 11, 4, 12, 0) do
          bike = create(:bike, user: current_user, name: "Soloist")
          in_window = create(:strava_activity, user: current_user, bike: bike,
            moved_at: 5.days.ago, distance_meters: 20_000, name: "Morning ride")
          create(:strava_activity, user: current_user, bike: bike, moved_at: 20.days.ago, distance_meters: 99_000)

          get "/dashboard"

          recent_rides = JSON.parse(response.body)["recent_rides"]
          expect(recent_rides["summary"]).to eq("count" => 1, "distance_meters" => 20_000)
          ride = recent_rides["rides"].first
          expect(ride["id"]).to eq(in_window.id)
          expect(ride["name"]).to eq("Morning ride")
          expect(ride["distance_meters"]).to eq(20_000)
          expect(ride["bike"]).to eq("id" => bike.id, "name" => "Soloist")
          expect(ride["indoor"]).to be false
        end
      end

      it "reports bike: null for an unattributed ride and indoor: true for a VirtualRide" do
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil,
          moved_at: 1.day.ago, activity_type: "VirtualRide", trainer: false)

        get "/dashboard"

        ride = JSON.parse(response.body)["recent_rides"]["rides"].first
        expect(ride["bike"]).to be_nil
        expect(ride["indoor"]).to be true
      end

      it "includes gear_id so an unattributed-but-has-gear ride can offer a gear-mapping link" do
        create(:strava_activity, user: current_user, bike: nil, gear_id: "g1", moved_at: 1.day.ago)

        get "/dashboard"

        expect(JSON.parse(response.body)["recent_rides"]["rides"].first["gear_id"]).to eq("g1")
      end

      it "lists which components a ride counts toward" do
        bike = create(:bike, user: current_user)
        component = create(:component, user: current_user, category: "chain", label: "Chain A")
        create(:component_assignment, component: component, bike: bike, started_at: 10.days.ago, ended_at: nil)
        create(:strava_activity, user: current_user, bike: bike, moved_at: 5.days.ago, distance_meters: 1_000)

        get "/dashboard"

        ride = JSON.parse(response.body)["recent_rides"]["rides"].first
        expect(ride["counted_toward"]).to eq([ { "component_id" => component.id, "label" => "Chain A" } ])
      end
    end

    describe "cross-account isolation" do
      it "never includes another user's bikes, components, or attention items" do
        other_bike = create(:bike)
        other_component = create(:component, user: other_bike.user, category: "chain")
        other_service_type = create(:service_type, user: other_bike.user)
        create(:component_service_interval, component: other_component, service_type: other_service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: other_component, bike: other_bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, user: other_bike.user, bike: other_bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

        get "/dashboard"

        body = JSON.parse(response.body)
        expect(body["bikes"]).to eq([])
        expect(body["attention"]).to eq([])
        expect(body["sync"]["rides_total"]).to eq(0)
      end

      it "never includes another user's rides in recent_rides" do
        other_bike = create(:bike)
        create(:strava_activity, user: other_bike.user, bike: other_bike, moved_at: 1.day.ago)

        get "/dashboard"

        expect(JSON.parse(response.body)["recent_rides"]["rides"]).to eq([])
      end
    end
  end
end
