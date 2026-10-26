require "rails_helper"

RSpec.describe NotificationSetting, type: :model do
  it "is valid with a user, notifications_enabled, and warning_threshold_percent" do
    expect(build(:notification_setting)).to be_valid
  end

  it "is invalid with a duplicate user" do
    user = create(:user)
    create(:notification_setting, user: user)
    duplicate = build(:notification_setting, user: user)

    expect(duplicate).not_to be_valid
  end

  it "is invalid with a warning_threshold_percent outside 0-100" do
    setting = build(:notification_setting, warning_threshold_percent: 101)

    expect(setting).not_to be_valid
    expect(setting.errors[:warning_threshold_percent]).to be_present
  end

  describe ".effective_for" do
    it "uses the hardcoded defaults when the user has no NotificationSetting and no category override" do
      user = create(:user)

      expect(NotificationSetting.effective_for(user: user, category: "chain"))
        .to eq(enabled: true, warning_threshold_percent: 5)
    end

    it "falls back to the global NotificationSetting when there is no category override" do
      user = create(:user)
      create(:notification_setting, user: user, notifications_enabled: false, warning_threshold_percent: 10)

      expect(NotificationSetting.effective_for(user: user, category: "chain"))
        .to eq(enabled: false, warning_threshold_percent: 10)
    end

    it "prefers a set category override over the global setting" do
      user = create(:user)
      create(:notification_setting, user: user, notifications_enabled: true, warning_threshold_percent: 10)
      create(:component_category_setting, user: user, category: "chain",
        notifications_enabled: false, warning_threshold_percent: 20)

      expect(NotificationSetting.effective_for(user: user, category: "chain"))
        .to eq(enabled: false, warning_threshold_percent: 20)
    end

    it "falls back per-field when only one category override field is set" do
      user = create(:user)
      create(:notification_setting, user: user, notifications_enabled: true, warning_threshold_percent: 10)
      create(:component_category_setting, user: user, category: "chain",
        notifications_enabled: nil, warning_threshold_percent: 20)

      expect(NotificationSetting.effective_for(user: user, category: "chain"))
        .to eq(enabled: true, warning_threshold_percent: 20)
    end
  end
end
