require "rails_helper"

RSpec.describe "ServiceTypes", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /service_types" do
    it "returns the user's own service types (wax/clean/replace/inspect, auto-provisioned)" do
      get "/service_types"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).map { |t| t["name"] }).to match_array(%w[wax clean replace inspect])
    end

    it "never includes another user's service types" do
      create(:service_type, name: "Lube") # another user's

      get "/service_types"

      expect(JSON.parse(response.body).map { |t| t["name"] }).not_to include("Lube")
    end
  end

  describe "POST /service_types" do
    it "creates a service type for the current user" do
      post "/service_types", params: { service_type: { name: "Lube" } }

      expect(response).to have_http_status(:created)
      expect(current_user.service_types.find_by(name: "Lube")).to be_present
    end

    it "rejects a duplicate name, case-insensitively" do
      post "/service_types", params: { service_type: { name: "Wax" } }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "cross-account isolation" do
    it "404s on GET /service_types/:id for another user's service type" do
      other_type = create(:service_type)

      get "/service_types/#{other_type.id}"

      expect(response).to have_http_status(:not_found)
    end

    it "404s on PATCH /service_types/:id for another user's service type" do
      other_type = create(:service_type, name: "Original")

      patch "/service_types/#{other_type.id}", params: { service_type: { name: "Hijacked" } }

      expect(response).to have_http_status(:not_found)
      expect(other_type.reload.name).to eq("Original")
    end

    it "404s on DELETE /service_types/:id for another user's service type" do
      other_type = create(:service_type)

      delete "/service_types/#{other_type.id}"

      expect(response).to have_http_status(:not_found)
      expect(ServiceType.exists?(other_type.id)).to be true
    end
  end

  describe "DELETE /service_types/:id" do
    it "is blocked while still in use by a maintenance event" do
      service_type = current_user.service_types.find_by!(name: "wax")
      create(:maintenance_event, component: create(:component, user: current_user), service_type: service_type)

      delete "/service_types/#{service_type.id}"

      expect(response).to have_http_status(:unprocessable_content)
      expect(ServiceType.exists?(service_type.id)).to be true
    end
  end
end
