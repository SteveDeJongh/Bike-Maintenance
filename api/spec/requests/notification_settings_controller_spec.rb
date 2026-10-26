require "rails_helper"

RSpec.describe "NotificationSettings", type: :request do
  let!(:current_user) { create(:user) }

  describe "GET /notification_settings" do
    it "returns the hardcoded defaults when the user has no row yet" do
      get "/notification_settings"

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["notifications_enabled"]).to be true
      expect(body["warning_threshold_percent"]).to eq(5)
    end

    it "returns the user's own saved settings" do
      create(:notification_setting, user: current_user, notifications_enabled: false, warning_threshold_percent: 15)

      get "/notification_settings"

      body = JSON.parse(response.body)
      expect(body["notifications_enabled"]).to be false
      expect(body["warning_threshold_percent"]).to eq(15)
    end
  end

  describe "PATCH /notification_settings" do
    it "creates the row on first write" do
      expect {
        patch "/notification_settings", params: {
          notification_setting: { notifications_enabled: false, warning_threshold_percent: 10 },
        }
      }.to change(NotificationSetting, :count).by(1)

      expect(response).to have_http_status(:ok)
    end

    it "updates the existing row rather than duplicating it" do
      create(:notification_setting, user: current_user)

      expect {
        patch "/notification_settings", params: { notification_setting: { warning_threshold_percent: 25 } }
      }.not_to change(NotificationSetting, :count)

      expect(current_user.notification_setting.reload.warning_threshold_percent).to eq(25)
    end
  end
end
