require "rails_helper"

RSpec.describe "ComponentCategorySettings", type: :request do
  # current_user resolves to User.first! — created first in each example so
  # it reliably has the lowest id, ahead of any other user a factory call
  # might incidentally create.
  let!(:current_user) { create(:user) }

  describe "GET /component_category_settings" do
    it "returns only the current user's settings" do
      create(:component_category_setting, user: current_user, category: "chain", default_ride_context: "both")
      create(:component_category_setting, category: "chain", default_ride_context: "outdoor_only")

      get "/component_category_settings"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.length).to eq(1)
      expect(body.first["category"]).to eq("chain")
      expect(body.first["default_ride_context"]).to eq("both")
    end
  end

  describe "PATCH /component_category_settings/:category" do
    it "creates a setting on first write" do
      expect {
        patch "/component_category_settings/cassette", params: {
          component_category_setting: { default_ride_context: "outdoor_only", trackable: false, allows_multiple_assignments: true },
        }
      }.to change(ComponentCategorySetting, :count).by(1)

      expect(response).to have_http_status(:ok)
      setting = current_user.component_category_settings.find_by(category: "cassette")
      expect(setting.default_ride_context).to eq("outdoor_only")
      expect(setting.trackable).to be false
      expect(setting.allows_multiple_assignments).to be true
    end

    it "updates an existing setting rather than duplicating it" do
      create(:component_category_setting, user: current_user, category: "cassette", default_ride_context: "outdoor_only")

      expect {
        patch "/component_category_settings/cassette", params: {
          component_category_setting: { default_ride_context: "indoor_only" },
        }
      }.not_to change(ComponentCategorySetting, :count)

      expect(current_user.component_category_settings.find_by(category: "cassette").default_ride_context).to eq("indoor_only")
    end
  end
end
