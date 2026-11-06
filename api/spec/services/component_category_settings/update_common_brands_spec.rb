require "rails_helper"

RSpec.describe ComponentCategorySettings::UpdateCommonBrands, type: :model do
  it "sets common_brands on the given category" do
    user = create(:user)

    described_class.call(user: user, category: "chain", brands: %w[Shimano SRAM])

    expect(user.component_category_settings.find_by(category: "chain").common_brands).to eq(%w[Shimano SRAM])
  end

  it "mirrors the same brands onto a paired category" do
    user = create(:user)

    described_class.call(user: user, category: "tire_front", brands: %w[Continental Maxxis])

    expect(user.component_category_settings.find_by(category: "tire_rear").common_brands).to eq(%w[Continental Maxxis])
  end

  it "does not touch any other category when the category is unpaired" do
    user = create(:user)
    # Users::Provision already seeded a "cassette" row for this user --
    # update it directly rather than via the factory, which would collide
    # with that seeded row's uniqueness validation.
    user.component_category_settings.find_by(category: "cassette").update!(common_brands: %w[Shimano])

    described_class.call(user: user, category: "chain", brands: %w[SRAM])

    expect(user.component_category_settings.find_by(category: "cassette").common_brands).to eq(%w[Shimano])
  end

  it "creates the partner row if it doesn't already exist" do
    user = create(:user)
    user.component_category_settings.where(category: "wheel_rear").destroy_all

    described_class.call(user: user, category: "wheel_front", brands: %w[Zipp])

    expect(user.component_category_settings.find_by(category: "wheel_rear").common_brands).to eq(%w[Zipp])
  end

  it "never touches another user's settings" do
    other_user = create(:user)
    other_setting = other_user.component_category_settings.find_by(category: "tire_front")
    other_setting.update!(common_brands: %w[Vittoria])
    user = create(:user)

    described_class.call(user: user, category: "tire_front", brands: %w[Maxxis])

    expect(other_setting.reload.common_brands).to eq(%w[Vittoria])
  end
end
