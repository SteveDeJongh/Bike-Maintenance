require "rails_helper"

RSpec.describe "MaintenanceEvents", type: :request do
  let!(:current_user) { create(:user) }

  describe "GET /maintenance_events" do
    it "returns only the current user's events" do
      mine = create(:maintenance_event, component: create(:component, user: current_user))
      create(:maintenance_event) # another user's event

      get "/maintenance_events"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).map { |e| e["id"] }).to eq([mine.id])
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
