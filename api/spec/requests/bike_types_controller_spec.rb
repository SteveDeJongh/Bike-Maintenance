require "rails_helper"

RSpec.describe "BikeTypes", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /bike_types" do
    it "returns the user's own bike types (Road/Gravel/Mountain/Time Trial/Commuter, auto-provisioned)" do
      get "/bike_types"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).map { |t| t["name"] }).to match_array(
        ["Road", "Gravel", "Mountain", "Time Trial", "Commuter"],
      )
    end

    it "never includes another user's bike types" do
      create(:bike_type, name: "Cyclocross") # another user's

      get "/bike_types"

      expect(JSON.parse(response.body).map { |t| t["name"] }).not_to include("Cyclocross")
    end
  end

  describe "POST /bike_types" do
    it "creates a bike type with default_categories for the current user" do
      post "/bike_types", params: { bike_type: { name: "Cyclocross", default_categories: %w[chain cassette] } }

      expect(response).to have_http_status(:created)
      bike_type = current_user.bike_types.find_by(name: "Cyclocross")
      expect(bike_type.default_categories).to eq(%w[chain cassette])
    end

    it "rejects a duplicate name, case-insensitively" do
      post "/bike_types", params: { bike_type: { name: "road" } }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "PATCH /bike_types/:id" do
    it "replaces default_categories as a whole array, not merging" do
      bike_type = current_user.bike_types.find_by!(name: "Road")

      patch "/bike_types/#{bike_type.id}", params: { bike_type: { default_categories: %w[frame] } }

      expect(response).to have_http_status(:ok)
      expect(bike_type.reload.default_categories).to eq(%w[frame])
    end
  end

  describe "cross-account isolation" do
    it "404s on GET /bike_types/:id for another user's bike type" do
      other_type = create(:bike_type)

      get "/bike_types/#{other_type.id}"

      expect(response).to have_http_status(:not_found)
    end

    it "404s on PATCH /bike_types/:id for another user's bike type" do
      other_type = create(:bike_type, name: "Original")

      patch "/bike_types/#{other_type.id}", params: { bike_type: { name: "Hijacked" } }

      expect(response).to have_http_status(:not_found)
      expect(other_type.reload.name).to eq("Original")
    end

    it "404s on DELETE /bike_types/:id for another user's bike type" do
      other_type = create(:bike_type)

      delete "/bike_types/#{other_type.id}"

      expect(response).to have_http_status(:not_found)
      expect(BikeType.exists?(other_type.id)).to be true
    end
  end

  describe "DELETE /bike_types/:id" do
    it "nullifies bike_type_id on bikes using it, rather than being blocked" do
      bike_type = current_user.bike_types.find_by!(name: "Road")
      bike = create(:bike, user: current_user, bike_type: bike_type)

      delete "/bike_types/#{bike_type.id}"

      expect(response).to have_http_status(:no_content)
      expect(BikeType.exists?(bike_type.id)).to be false
      expect(bike.reload.bike_type_id).to be_nil
    end
  end
end
