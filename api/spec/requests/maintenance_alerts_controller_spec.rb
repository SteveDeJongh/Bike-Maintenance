require "rails_helper"

RSpec.describe "MaintenanceAlerts", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /maintenance_alerts" do
    it "returns a due, currently-installed interval" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain")
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      get "/maintenance_alerts"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.length).to eq(1)
      expect(body.first["status"]).to eq("due")
      expect(body.first["component_id"]).to eq(component.id)
    end

    it "excludes an ok interval, and only current_user's intervals" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain")
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000_000)
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      other_bike = create(:bike)
      other_component = create(:component, user: other_bike.user, category: "chain")
      other_service_type = other_bike.user.service_types.find_by!(name: "wax")
      create(:component_service_interval, component: other_component, service_type: other_service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: other_component, bike: other_bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: other_bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      get "/maintenance_alerts"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq([])
    end

    it "includes bike_ids: every bike the component is currently mounted on" do
      bike = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "chain")
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      get "/maintenance_alerts"

      expect(JSON.parse(response.body).first["bike_ids"]).to eq([ bike.id ])
    end

    it "lists a shared indoor_only component's alert under both of its bikes' ids" do
      ComponentCategorySetting.find_or_initialize_by(user: current_user, category: "cassette")
        .update!(allows_multiple_assignments: true)
      bike_a = create(:bike, user: current_user)
      bike_b = create(:bike, user: current_user)
      component = create(:component, user: current_user, category: "cassette")
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:component_service_interval, component: component, service_type: service_type, distance_interval_meters: 1_000)
      create(:component_assignment, component: component, bike: bike_a, ride_context: "indoor_only",
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:component_assignment, component: component, bike: bike_b, ride_context: "indoor_only",
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike_a, trainer: true, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

      get "/maintenance_alerts", params: { bike_id: bike_a.id }
      expect(JSON.parse(response.body).length).to eq(1)

      get "/maintenance_alerts", params: { bike_id: bike_b.id }
      expect(JSON.parse(response.body).length).to eq(1)
    end

    describe "bike_id filter" do
      it "returns only alerts for components currently mounted on that bike" do
        bike = create(:bike, user: current_user)
        other_bike = create(:bike, user: current_user)
        mounted = create(:component, user: current_user, category: "chain")
        elsewhere = create(:component, user: current_user, category: "cassette")
        service_type = current_user.service_types.find_by!(name: "wax")
        create(:component_service_interval, component: mounted, service_type: service_type, distance_interval_meters: 1_000)
        create(:component_service_interval, component: elsewhere, service_type: service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: mounted, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:component_assignment, component: elsewhere, bike: other_bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)
        create(:strava_activity, bike: other_bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

        get "/maintenance_alerts", params: { bike_id: bike.id }

        body = JSON.parse(response.body)
        expect(body.map { |a| a["component_id"] }).to eq([ mounted.id ])
      end

      it "returns an empty list for another user's bike_id, not that user's alerts" do
        other_bike = create(:bike)
        other_component = create(:component, user: other_bike.user, category: "chain")
        other_service_type = other_bike.user.service_types.find_by!(name: "wax")
        create(:component_service_interval, component: other_component, service_type: other_service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: other_component, bike: other_bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, bike: other_bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

        get "/maintenance_alerts", params: { bike_id: other_bike.id }

        expect(JSON.parse(response.body)).to eq([])
      end
    end

    describe "component_id filter" do
      it "returns only that component's alert" do
        bike = create(:bike, user: current_user)
        wanted = create(:component, user: current_user, category: "chain")
        other = create(:component, user: current_user, category: "cassette")
        service_type = current_user.service_types.find_by!(name: "wax")
        create(:component_service_interval, component: wanted, service_type: service_type, distance_interval_meters: 1_000)
        create(:component_service_interval, component: other, service_type: service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: wanted, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:component_assignment, component: other, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

        get "/maintenance_alerts", params: { component_id: wanted.id }

        body = JSON.parse(response.body)
        expect(body.map { |a| a["component_id"] }).to eq([ wanted.id ])
      end

      it "returns an empty list for another user's component_id" do
        other_bike = create(:bike)
        other_component = create(:component, user: other_bike.user, category: "chain")
        other_service_type = other_bike.user.service_types.find_by!(name: "wax")
        create(:component_service_interval, component: other_component, service_type: other_service_type, distance_interval_meters: 1_000)
        create(:component_assignment, component: other_component, bike: other_bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, bike: other_bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 1_000)

        get "/maintenance_alerts", params: { component_id: other_component.id }

        expect(JSON.parse(response.body)).to eq([])
      end
    end
  end
end
