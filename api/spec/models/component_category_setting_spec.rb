require "rails_helper"

RSpec.describe ComponentCategorySetting, type: :model do
  it "is valid with a user, category, default_ride_context, trackable, and allows_multiple_assignments" do
    expect(build(:component_category_setting)).to be_valid
  end

  it "is invalid without a category" do
    setting = build(:component_category_setting, category: nil)

    expect(setting).not_to be_valid
    expect(setting.errors[:category]).to be_present
  end

  it "is invalid with a default_ride_context outside the known set" do
    setting = build(:component_category_setting, default_ride_context: "upside_down")

    expect(setting).not_to be_valid
    expect(setting.errors[:default_ride_context]).to be_present
  end

  it "is valid with notifications_enabled and warning_threshold_percent left nil (inherit global)" do
    setting = build(:component_category_setting, notifications_enabled: nil, warning_threshold_percent: nil)

    expect(setting).to be_valid
  end

  it "is invalid with a warning_threshold_percent outside 0-100" do
    setting = build(:component_category_setting, warning_threshold_percent: 150)

    expect(setting).not_to be_valid
    expect(setting.errors[:warning_threshold_percent]).to be_present
  end

  it "is invalid with a duplicate category for the same user" do
    user = create(:user)
    create(:component_category_setting, user: user, category: "cassette")
    duplicate = build(:component_category_setting, user: user, category: "cassette")

    expect(duplicate).not_to be_valid
  end

  it "allows the same category for different users" do
    create(:component_category_setting, category: "cassette")
    other_user_setting = build(:component_category_setting, category: "cassette")

    expect(other_user_setting).to be_valid
  end
end
