require "rails_helper"

RSpec.describe "ComponentCategorySettings", type: :request do
  # current_user resolves to User.first! — created first in each example so
  # it reliably has the lowest id, ahead of any other user a factory call
  # might incidentally create.
  let!(:current_user) { create(:user) }

  describe "GET /component_category_settings" do
    it "returns only the current user's settings" do
      create(:component_category_setting, user: current_user, category: "chain", accrues_indoor_mileage: true)
      create(:component_category_setting, category: "chain", accrues_indoor_mileage: false)

      get "/component_category_settings"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body.length).to eq(1)
      expect(body.first["category"]).to eq("chain")
      expect(body.first["accrues_indoor_mileage"]).to be true
    end
  end

  describe "PATCH /component_category_settings/:category" do
    it "creates a setting on first write" do
      expect {
        patch "/component_category_settings/cassette", params: {
          component_category_setting: { accrues_indoor_mileage: false },
        }
      }.to change(ComponentCategorySetting, :count).by(1)

      expect(response).to have_http_status(:ok)
      expect(current_user.component_category_settings.find_by(category: "cassette").accrues_indoor_mileage).to be false
    end

    it "updates an existing setting rather than duplicating it" do
      create(:component_category_setting, user: current_user, category: "cassette", accrues_indoor_mileage: false)

      expect {
        patch "/component_category_settings/cassette", params: {
          component_category_setting: { accrues_indoor_mileage: true },
        }
      }.not_to change(ComponentCategorySetting, :count)

      expect(current_user.component_category_settings.find_by(category: "cassette").accrues_indoor_mileage).to be true
    end
  end
end
