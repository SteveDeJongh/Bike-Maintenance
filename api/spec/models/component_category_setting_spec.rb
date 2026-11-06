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
    # "fenders" is deliberately not one of the categories Users::Provision
    # seeds automatically, so this stays a clean test of the uniqueness
    # validation itself rather than colliding with a provisioned default.
    user = create(:user)
    create(:component_category_setting, user: user, category: "fenders")
    duplicate = build(:component_category_setting, user: user, category: "fenders")

    expect(duplicate).not_to be_valid
  end

  it "allows the same category for different users" do
    create(:component_category_setting, category: "fenders")
    other_user_setting = build(:component_category_setting, category: "fenders")

    expect(other_user_setting).to be_valid
  end

  describe "#common_brands=" do
    it "strips whitespace, drops blanks, and dedupes" do
      setting = build(:component_category_setting, common_brands: [ " Shimano ", "SRAM", "", " ", "Shimano" ])

      expect(setting.common_brands).to eq(%w[Shimano SRAM])
    end

    it "dedupes case-insensitively, keeping the first spelling seen" do
      setting = build(:component_category_setting, common_brands: %w[Shimano shimano SHIMANO Sram sram])

      expect(setting.common_brands).to eq(%w[Shimano Sram])
    end

    it "defaults to an empty array" do
      expect(build(:component_category_setting).common_brands).to eq([])
    end
  end

  describe ".brand_list_partner" do
    it "returns the paired category for a front/rear pair" do
      expect(ComponentCategorySetting.brand_list_partner("tire_front")).to eq("tire_rear")
      expect(ComponentCategorySetting.brand_list_partner("tire_rear")).to eq("tire_front")
    end

    it "returns nil for an unpaired category, including one seeded from the same brand group" do
      expect(ComponentCategorySetting.brand_list_partner("chain")).to be_nil
      expect(ComponentCategorySetting.brand_list_partner("cassette")).to be_nil
      expect(ComponentCategorySetting.brand_list_partner("fenders")).to be_nil
    end
  end

  describe "#brand_list_partner" do
    it "delegates to the class method for its own category" do
      setting = build(:component_category_setting, category: "wheel_rear")

      expect(setting.brand_list_partner).to eq("wheel_front")
    end
  end
end
