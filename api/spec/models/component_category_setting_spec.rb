require "rails_helper"

RSpec.describe ComponentCategorySetting, type: :model do
  it "is valid with a user, category, and accrues_indoor_mileage" do
    expect(build(:component_category_setting)).to be_valid
  end

  it "is invalid without a category" do
    setting = build(:component_category_setting, category: nil)

    expect(setting).not_to be_valid
    expect(setting.errors[:category]).to be_present
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
