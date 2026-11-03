require "rails_helper"

RSpec.describe "ComponentCategorySettings", type: :request do
  # current_user resolves to User.first! — created first in each example so
  # it reliably has the lowest id, ahead of any other user a factory call
  # might incidentally create.
  let!(:current_user) { create(:user) }

  describe "GET /component_category_settings" do
    it "returns only the current user's settings" do
      # current_user already has an auto-provisioned row per category (see
      # Users::Provision); this only needs to confirm another user's row
      # with the same category doesn't leak into the response.
      other_user = create(:user)
      other_user.component_category_settings.find_by!(category: "chain").update!(default_ride_context: "outdoor_only")

      get "/component_category_settings"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.pluck("category")).to match_array(current_user.component_category_settings.pluck(:category))
      chain_setting = body.find { |s| s["category"] == "chain" }
      expect(chain_setting["default_ride_context"]).to eq("both")
    end
  end

  describe "PATCH /component_category_settings/:category" do
    it "creates a setting on first write" do
      # "frame" is deliberately not one of the categories Users::Provision
      # seeds automatically, so there's genuinely no row yet to write over.
      expect {
        patch "/component_category_settings/frame", params: {
          component_category_setting: { default_ride_context: "outdoor_only", trackable: false, allows_multiple_assignments: true },
        }
      }.to change(ComponentCategorySetting, :count).by(1)

      expect(response).to have_http_status(:ok)
      setting = current_user.component_category_settings.find_by(category: "frame")
      expect(setting.default_ride_context).to eq("outdoor_only")
      expect(setting.trackable).to be false
      expect(setting.allows_multiple_assignments).to be true
    end

    it "updates an existing setting rather than duplicating it" do
      # cassette is already auto-provisioned (default_ride_context:
      # "outdoor_only") -- nothing to create here, this only has to confirm
      # the PATCH updates that row in place rather than duplicating it.
      expect {
        patch "/component_category_settings/cassette", params: {
          component_category_setting: { default_ride_context: "indoor_only" },
        }
      }.not_to change(ComponentCategorySetting, :count)

      expect(current_user.component_category_settings.find_by(category: "cassette").default_ride_context).to eq("indoor_only")
    end
  end
end
