require "rails_helper"

RSpec.describe "MaintenanceEvents", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /maintenance_events" do
    it "returns only the current user's events, with sessions, meta and a cursor" do
      mine = create(:maintenance_event, component: create(:component, user: current_user))
      create(:maintenance_event) # another user's event

      get "/maintenance_events", params: { tz: "UTC" }

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["events"].map { |e| e["id"] }).to eq([ mine.id ])
      expect(body["events"].first).to include(
        "component" => include("id" => mine.component_id), "service_type" => include("id" => mine.service_type_id),
        "bike" => nil, "since_last_same_type_meters" => nil, "resets" => [],
      )
      expect(body).to include("sessions" => {}, "next_cursor" => nil)
      expect(body["meta"]).to include("total" => 1, "kind_counts" => { "session" => 0, "single" => 1 })
    end

    it "passes the filters and paging through" do
      component = create(:component, user: current_user)
      3.times { |n| create(:maintenance_event, component: component, performed_at: Time.zone.local(2026, 1, n + 1)) }

      get "/maintenance_events", params: { per_page: 2, kinds: [ "single" ] }
      body = JSON.parse(response.body)
      get "/maintenance_events", params: { per_page: 2, kinds: [ "single" ], cursor: body["next_cursor"] }

      expect(body["events"].size).to eq(2)
      expect(JSON.parse(response.body)["events"].size).to eq(1)
    end

    it "rejects an unknown sort" do
      get "/maintenance_events", params: { sort: "label" }
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "POST /maintenance_events" do
    it "creates an event for the current user's own component and service type" do
      component = create(:component, user: current_user)
      service_type = current_user.service_types.find_by!(name: "wax")

      post "/maintenance_events", params: {
        maintenance_event: { component_id: component.id, service_type_id: service_type.id, performed_at: "2026-06-01T12:00:00Z" },
      }

      expect(response).to have_http_status(:created)
    end

    it "does not create against another user's component" do
      other_component = create(:component)
      service_type = current_user.service_types.find_by!(name: "wax")

      post "/maintenance_events", params: {
        maintenance_event: { component_id: other_component.id, service_type_id: service_type.id, performed_at: "2026-06-01T12:00:00Z" },
      }

      expect(response).to have_http_status(:not_found)
    end

    it "does not create against another user's service_type" do
      component = create(:component, user: current_user)
      other_service_type = create(:service_type)

      post "/maintenance_events", params: {
        maintenance_event: { component_id: component.id, service_type_id: other_service_type.id, performed_at: "2026-06-01T12:00:00Z" },
      }

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "PATCH /maintenance_events/:id" do
    it "does not update to reference another user's service_type" do
      event = create(:maintenance_event, component: create(:component, user: current_user))
      other_service_type = create(:service_type)

      patch "/maintenance_events/#{event.id}", params: { maintenance_event: { service_type_id: other_service_type.id } }

      expect(response).to have_http_status(:not_found)
      expect(event.reload.service_type_id).not_to eq(other_service_type.id)
    end
  end

  describe "DELETE /maintenance_events/:id" do
    it "does not allow deleting another user's event" do
      other_event = create(:maintenance_event)

      delete "/maintenance_events/#{other_event.id}"

      expect(response).to have_http_status(:not_found)
      expect(MaintenanceEvent.exists?(other_event.id)).to be true
    end
  end
end
