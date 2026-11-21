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

      it "reports last_sync_failed_at/last_sync_error/last_sync_retry_at from the credential" do
        create(:strava_credential, user: current_user,
          last_sync_failed_at: Time.zone.local(2026, 11, 4, 9, 0),
          last_sync_error: "rate_limited",
          last_sync_retry_at: Time.zone.local(2026, 11, 4, 9, 15))

        get "/dashboard"

        sync = JSON.parse(response.body)["sync"]
        expect(sync["last_sync_failed_at"]).to eq("2026-11-04T09:00:00.000Z")
        expect(sync["last_sync_error"]).to eq("rate_limited")
        expect(sync["last_sync_retry_at"]).to eq("2026-11-04T09:15:00.000Z")
      end

      it "reports null failure fields when there has never been a failure" do
        create(:strava_credential, user: current_user)

        get "/dashboard"

        sync = JSON.parse(response.body)["sync"]
        expect(sync["last_sync_failed_at"]).to be_nil
        expect(sync["last_sync_error"]).to be_nil
        expect(sync["last_sync_retry_at"]).to be_nil
      end

      it "reports null failure fields with no credential at all" do
        get "/dashboard"

        sync = JSON.parse(response.body)["sync"]
        expect(sync["last_sync_failed_at"]).to be_nil
        expect(sync["last_sync_error"]).to be_nil
        expect(sync["last_sync_retry_at"]).to be_nil
      end

      it "sources unmapped_gear_count from the same place as /strava/unmapped_gear" do
        create(:strava_gear, user: current_user, strava_gear_id: "g1")
        create(:bike, user: current_user, strava_gear_id: "g2")
        create(:strava_gear, user: current_user, strava_gear_id: "g2")

        get "/dashboard"

        expect(JSON.parse(response.body)["sync"]["unattributed"]["unmapped_gear_count"]).to eq(1)
      end

      it "excludes rides whose gear was ignored (and hasn't resurfaced) from unattributed and with_gear" do
        create(:strava_gear, user: current_user, strava_gear_id: "ignored", ignored_at: Time.current)
        create(:strava_activity, user: current_user, bike: nil, gear_id: "ignored", distance_meters: 10_000)
        # A no-gear ride is unaffected by any ignore decision -- still counted.
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil, distance_meters: 1_000)

        get "/dashboard"

        unattributed = JSON.parse(response.body)["sync"]["unattributed"]
        expect(unattributed["count"]).to eq(1)
        expect(unattributed["with_gear"]).to eq("count" => 0, "distance_meters" => 0)
        expect(unattributed["without_gear"]).to eq("count" => 1, "distance_meters" => 1_000)
      end

      it "counts a resurfaced ignored gear's rides again" do
        create(:strava_gear, user: current_user, strava_gear_id: "g1", ignored_at: 10.days.ago)
        create(:strava_activity, user: current_user, bike: nil, gear_id: "g1", distance_meters: 5_000, moved_at: 1.day.ago)

        get "/dashboard"

        unattributed = JSON.parse(response.body)["sync"]["unattributed"]
        expect(unattributed["with_gear"]).to eq("count" => 1, "distance_meters" => 5_000)
      end

      it "excludes a ride-ignored ride alongside a gear-ignored ride, keeping a plain unattributed ride" do
        create(:strava_gear, user: current_user, strava_gear_id: "ignored_gear", ignored_at: Time.current)
        create(:strava_activity, user: current_user, bike: nil, gear_id: "ignored_gear", distance_meters: 10_000)
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil, ignored_at: Time.current, distance_meters: 20_000)
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil, distance_meters: 1_000)

        get "/dashboard"

        unattributed = JSON.parse(response.body)["sync"]["unattributed"]
        expect(unattributed["count"]).to eq(1)
        expect(unattributed["distance_meters"]).to eq(1_000)
      end

      it "matches GET /strava/rides' meta.status_counts.attention exactly" do
        create(:strava_gear, user: current_user, strava_gear_id: "ignored_gear", ignored_at: Time.current)
        create(:strava_activity, user: current_user, bike: nil, gear_id: "ignored_gear")
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil, ignored_at: Time.current)
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil)
        create(:strava_activity, user: current_user, bike: nil, gear_id: "g1")
        create(:strava_activity, user: current_user, bike: create(:bike, user: current_user))

        get "/dashboard"
        dashboard_count = JSON.parse(response.body)["sync"]["unattributed"]["count"]

        get "/strava/rides", params: { status: "attention" }
        rides_meta_count = JSON.parse(response.body)["meta"]["status_counts"]["attention"]

        expect(dashboard_count).to eq(rides_meta_count)
        expect(dashboard_count).to eq(2)
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
        requirement = create(:component_service_requirement, component: component, service_type: service_type,
          name: "Chain lube", distance_interval_meters: 1_000)
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
          "requirement_name" => requirement.name, "distance_meters" => 1_200,
          "moving_time_seconds" => nil, "days" => nil, "since_service_type_name" => nil,
        )
      end

      it "names the setting event's own service type once a service has been logged" do
        bike = create(:bike, user: current_user)
        component = create(:component, user: current_user, category: "chain", label: "Chain A")
        service_type = current_user.service_types.find_by!(name: "wax")
        create(:component_service_requirement, component: component, service_type: service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:maintenance_event, component: component, service_type: service_type, performed_at: Time.zone.local(2026, 1, 2))
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 400)

        get "/dashboard"

        mounted = JSON.parse(response.body)["bikes"].first["mounted"].first
        expect(mounted["display_metric"]["since_service_type_name"]).to eq("wax")
        expect(mounted["display_metric"]["distance_meters"]).to eq(400)
      end

      it "falls back to total_distance with a nil requirement_name when the component has no enabled interval" do
        bike = create(:bike, user: current_user)
        component = create(:component, user: current_user, category: "saddle")
        create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 500)

        get "/dashboard"

        mounted = JSON.parse(response.body)["bikes"].first["mounted"].first
        expect(mounted["display_metric"]).to eq(
          "requirement_name" => nil, "distance_meters" => 500,
          "moving_time_seconds" => nil, "days" => nil, "since_service_type_name" => nil,
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
        create(:component_service_requirement, component: component, service_type: service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)
        component
      end

      it "includes a due interval, excludes an ok one" do
        bike = create(:bike, user: current_user)
        due = due_component(bike: bike)
        ok_component = create(:component, user: current_user, category: "saddle")
        ok_type = current_user.service_types.find_by!(name: "inspect")
        create(:component_service_requirement, component: ok_component, service_type: ok_type, distance_interval_meters: 1_000_000)
        create(:component_assignment, component: ok_component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)

        get "/dashboard"

        attention = JSON.parse(response.body)["attention"]
        expect(attention.map { |a| a["component_id"] }).to eq([ due.id ])
        expect(attention.first["status"]).to eq("due")
        expect(attention.first["bike"]).to eq("id" => bike.id, "name" => bike.name)
        expect(attention.first["mounted"]).to be true
        expect(attention.first["satisfiers"].first["service_type_name"]).to eq("wax")
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
        interval = component.component_service_requirements.first
        create(:service_alert_dismissal, component_service_requirement: interval, dismissed_status: "due", dismissed_at: Time.current)

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
        create(:component_service_requirement, component: warning_component, service_type: warning_type, distance_interval_meters: 1_000)
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

      it "includes elapsed_time so a ride can prefill Log service at its end, preserving null" do
        create(:strava_activity, user: current_user, bike: create(:bike, user: current_user),
          moved_at: 1.day.ago, elapsed_time: 3_600)
        create(:strava_activity, user: current_user, bike: create(:bike, user: current_user),
          moved_at: 2.days.ago, elapsed_time: nil)

        get "/dashboard"

        rides = JSON.parse(response.body)["recent_rides"]["rides"]
        expect(rides.map { |r| r.fetch("elapsed_time") }).to eq([3_600, nil])
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

    describe "upcoming" do
      let(:bike) { create(:bike, user: current_user) }

      # 10 km ridden on `bike` since Jan 1, so a requirement's fraction is
      # 10_000 / interval.
      before { create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 10_000) }

      def component_with_interval(interval, category:, mounted: true)
        component = create(:component, user: current_user, category: category, label: "#{category} part")
        create(:component_service_requirement, component: component, service_type: current_user.service_types.find_by!(name: "inspect"),
          distance_interval_meters: interval)
        create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1),
          ended_at: mounted ? nil : Time.zone.local(2026, 2, 1))
        component
      end

      it "lists ok requirements on mounted components, nearest to due first, capped at five" do
        expected = [ 20_000, 25_000, 50_000, 100_000, 200_000 ].each_with_index.map do |interval, index|
          component_with_interval(interval, category: "part_#{index}")
        end
        component_with_interval(1_000_000, category: "part_far") # sixth: cut by the cap
        due = component_with_interval(5_000, category: "part_due")
        component_with_interval(30_000, category: "part_unmounted", mounted: false)
        component_with_interval(30_000, category: "part_retired").update!(retired_on: Date.current)

        get "/dashboard"

        body = JSON.parse(response.body)
        upcoming = body["upcoming"]
        expect(upcoming.map { |item| item["component_id"] }).to eq(expected.map(&:id))
        expect(upcoming.map { |item| item["status"] }.uniq).to eq([ "ok" ])
        expect(upcoming.first["fraction_used"]).to eq(0.5)
        expect(upcoming.first["bike"]).to eq("id" => bike.id, "name" => bike.name)
        expect(body["attention"].map { |item| item["component_id"] }).to eq([ due.id ])
      end

      it "uses the attention item shape, and leaves attention's own keys unchanged" do
        component_with_interval(20_000, category: "chain")
        component_with_interval(5_000, category: "saddle")

        get "/dashboard"

        body = JSON.parse(response.body)
        attention_keys = %w[
          component_id component_label requirement_id requirement_name satisfiers status driving_dimension
          distance_used_meters effective_distance_meters moving_time_used_seconds effective_moving_time_seconds
          days_used effective_calendar_amount effective_calendar_unit distance_remaining_meters
          moving_time_remaining_seconds days_remaining fraction_used setting_event dismissed notifications_off mounted bike
        ]
        expect(body["attention"].first.keys).to eq(attention_keys)
        expect(body["upcoming"].first.keys).to eq(attention_keys)
      end
    end

    describe "bikes: wear and rotation fields" do
      let!(:bike) { create(:bike, user: current_user) }
      let(:inspect_type) { current_user.service_types.find_by!(name: "inspect") }

      def bike_payload
        get "/dashboard"
        JSON.parse(response.body)["bikes"].find { |b| b["id"] == bike.id }
      end

      def mount(component, from: Time.zone.local(2026, 1, 1), to: nil)
        create(:component_assignment, component: component, bike: bike, started_at: from, ended_at: to)
        component
      end

      it "reports the driving requirement's progress, including when overdue" do
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 10_000)
        overdue = mount(create(:component, user: current_user, category: "chain", label: "Chain A"))
        create(:component_service_requirement, component: overdue, service_type: inspect_type, distance_interval_meters: 4_000)
        plain = mount(create(:component, user: current_user, category: "saddle", label: "Saddle"))

        mounted = bike_payload["mounted"].index_by { |m| m["component_id"] }
        expect(mounted[overdue.id].slice("service_status", "fraction_used", "driving_dimension", "distance_remaining_meters",
          "moving_time_remaining_seconds", "days_remaining", "total_distance_meters")).to eq(
          "service_status" => "due", "fraction_used" => 2.5, "driving_dimension" => "distance",
          "distance_remaining_meters" => -6_000, "moving_time_remaining_seconds" => nil, "days_remaining" => nil,
          "total_distance_meters" => nil,
        )
        expect(mounted[plain.id].slice("fraction_used", "driving_dimension", "distance_remaining_meters", "total_distance_meters"))
          .to eq("fraction_used" => nil, "driving_dimension" => nil, "distance_remaining_meters" => nil, "total_distance_meters" => nil)
        expect(mounted[plain.id]["display_metric"]["distance_meters"]).to eq(10_000)
      end

      it "gives lifetime distance to both sides of a same-category rotation, and to nothing else" do
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2025, 12, 10), distance_meters: 3_000)
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 10_000)
        chain_a = mount(create(:component, user: current_user, category: "chain", label: "Chain A"))
        chain_b = mount(create(:component, user: current_user, category: "chain", label: "Chain B"),
          from: Time.zone.local(2025, 12, 1), to: Time.zone.local(2026, 1, 1))
        lone_saddle = mount(create(:component, user: current_user, category: "saddle", label: "Old saddle"),
          from: Time.zone.local(2025, 12, 1), to: Time.zone.local(2026, 1, 1))

        payload = bike_payload
        mounted = payload["mounted"].index_by { |m| m["component_id"] }
        off_bike = payload["off_bike"].index_by { |c| c["component_id"] }
        expect(mounted[chain_a.id]["total_distance_meters"]).to eq(10_000)
        expect(off_bike[chain_b.id]["total_distance_meters"]).to eq(3_000)
        expect(off_bike[lone_saddle.id]["total_distance_meters"]).to be_nil
        expect(off_bike[chain_b.id]).to include("fraction_used" => nil, "driving_dimension" => nil)
      end

      it "reports the latest ride's sport type" do
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), activity_type: "Ride")
        create(:strava_activity, user: current_user, bike: bike, moved_at: Time.zone.local(2026, 1, 9), activity_type: "GravelRide")

        expect(bike_payload["last_ride_activity_type"]).to eq("GravelRide")
      end

      it "reports a null sport type with no rides" do
        expect(bike_payload["last_ride_activity_type"]).to be_nil
      end
    end

    describe "stats" do
      let(:vancouver) { ActiveSupport::TimeZone["America/Vancouver"] }
      let(:bike) { create(:bike, user: current_user) }

      def ride_at(local, distance: 1_000, **attrs)
        create(:strava_activity, user: current_user, bike: bike, moved_at: vancouver.parse(local), distance_meters: distance, **attrs)
      end

      def stats(tz: "America/Vancouver")
        get "/dashboard", params: { tz: tz }
        JSON.parse(response.body)["stats"]
      end

      # Friday 2026-11-20, midday in Vancouver. Local times are parsed with
      # Ruby's zone data, the same source the boundaries use.
      before { travel_to(Time.utc(2026, 11, 20, 20, 0)) }
      after { travel_back }

      it "starts the week on Monday in the viewer's tz and zero-fills every day" do
        ride_at("2026-11-15 23:30", distance: 9_000) # Sunday night: last week
        ride_at("2026-11-16 00:01", distance: 2_000, moving_time: 600, total_elevation_gain: 50.5)
        ride_at("2026-11-19 10:00", distance: 3_000, moving_time: 900, total_elevation_gain: 20)

        week = stats["week"]
        expect(week["start_date"]).to eq("2026-11-16")
        expect(week.slice("distance_meters", "moving_time_seconds", "elevation_gain_meters", "ride_count"))
          .to eq("distance_meters" => 5_000, "moving_time_seconds" => 1_500, "elevation_gain_meters" => 70.5, "ride_count" => 2)
        expect(week["daily"]).to eq([
          { "date" => "2026-11-16", "distance_meters" => 2_000 },
          { "date" => "2026-11-17", "distance_meters" => 0 },
          { "date" => "2026-11-18", "distance_meters" => 0 },
          { "date" => "2026-11-19", "distance_meters" => 3_000 },
          { "date" => "2026-11-20", "distance_meters" => 0 },
          { "date" => "2026-11-21", "distance_meters" => 0 },
          { "date" => "2026-11-22", "distance_meters" => 0 },
        ])
        expect(stats["today"]).to eq("2026-11-20")
      end

      it "groups rides either side of local midnight by local day, not UTC day" do
        ride_at("2026-11-17 23:59", distance: 1_000) # already the 18th in UTC
        ride_at("2026-11-18 00:01", distance: 4_000)

        daily = stats["week"]["daily"].to_h { |day| [ day["date"], day["distance_meters"] ] }
        expect(daily["2026-11-17"]).to eq(1_000)
        expect(daily["2026-11-18"]).to eq(4_000)
      end

      it "uses the local calendar month" do
        ride_at("2026-10-31 23:30", distance: 7_000) # already November in UTC
        ride_at("2026-11-01 00:30", distance: 2_000)

        month = stats["month"]
        expect(month["start_date"]).to eq("2026-11-01")
        expect(month["distance_meters"]).to eq(2_000)
        expect(month["ride_count"]).to eq(1)
      end

      it "compares year to date with last year to the same moment, and last year's total" do
        ride_at("2026-01-01 00:10", distance: 10_000)
        ride_at("2025-12-31 23:50", distance: 1_000) # last year, after today's date
        ride_at("2025-11-20 11:00", distance: 3_000) # last year, before noon on the same date
        ride_at("2025-11-20 13:00", distance: 5_000) # last year, after it
        ride_at("2024-12-31 23:00", distance: 99_000) # two years ago

        ytd = stats["year_to_date"]
        expect(ytd).to eq(
          "distance_meters" => 10_000,
          "last_year_to_date_distance_meters" => 3_000,
          "last_year_total_distance_meters" => 9_000,
        )
      end

      it "clamps a Feb 29 today to Feb 28 last year" do
        travel_back
        travel_to(vancouver.parse("2028-02-29 12:00"))
        ride_at("2027-02-28 11:00", distance: 2_000)
        ride_at("2027-02-28 13:00", distance: 4_000)
        ride_at("2027-03-01 09:00", distance: 8_000)

        ytd = stats["year_to_date"]
        expect(ytd["last_year_to_date_distance_meters"]).to eq(2_000)
        expect(ytd["last_year_total_distance_meters"]).to eq(14_000)
      end

      it "counts rides with no bike but excludes individually ignored rides" do
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil, moved_at: vancouver.parse("2026-11-18 09:00"), distance_meters: 3_000)
        create(:strava_activity, user: current_user, bike: nil, gear_id: nil, moved_at: vancouver.parse("2026-11-18 10:00"),
          distance_meters: 50_000, ignored_at: Time.current)

        body = stats
        expect(body["week"]["distance_meters"]).to eq(3_000)
        expect(body["month"]["distance_meters"]).to eq(3_000)
        expect(body["year_to_date"]["distance_meters"]).to eq(3_000)
      end

      it "falls back to UTC for an unknown tz" do
        ride_at("2026-11-15 20:00", distance: 1_000) # Sunday in Vancouver, Monday 04:00 UTC

        body = stats(tz: "Not/AZone")
        expect(body["week"]["daily"].first).to eq("date" => "2026-11-16", "distance_meters" => 1_000)
      end

      it "never counts another user's rides" do
        other_bike = create(:bike)
        create(:strava_activity, user: other_bike.user, bike: other_bike, moved_at: vancouver.parse("2026-11-18 09:00"))

        expect(stats["week"]["ride_count"]).to eq(0)
      end
    end

    describe "cross-account isolation" do
      it "never includes another user's bikes, components, or attention items" do
        other_bike = create(:bike)
        other_component = create(:component, user: other_bike.user, category: "chain")
        other_service_type = create(:service_type, user: other_bike.user)
        create(:component_service_requirement, component: other_component, service_type: other_service_type, distance_interval_meters: 1_000)
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
