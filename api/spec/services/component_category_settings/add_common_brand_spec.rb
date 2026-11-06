require "rails_helper"

RSpec.describe ComponentCategorySettings::AddCommonBrand, type: :model do
  it "adds a new brand to the category's common_brands" do
    user = create(:user)
    chain_setting = user.component_category_settings.find_by!(category: "chain")
    chain_setting.update!(common_brands: %w[Shimano])

    described_class.call(user: user, category: "chain", brand: "SRAM")

    expect(chain_setting.reload.common_brands).to eq(%w[Shimano SRAM])
  end

  it "does not add a case-insensitive duplicate" do
    user = create(:user)
    chain_setting = user.component_category_settings.find_by!(category: "chain")
    chain_setting.update!(common_brands: %w[Shimano])

    described_class.call(user: user, category: "chain", brand: "shimano")

    expect(chain_setting.reload.common_brands).to eq(%w[Shimano])
  end

  it "adds nothing for a blank brand" do
    user = create(:user)
    chain_setting = user.component_category_settings.find_by!(category: "chain")
    original = chain_setting.common_brands

    described_class.call(user: user, category: "chain", brand: "")
    described_class.call(user: user, category: "chain", brand: nil)

    expect(chain_setting.reload.common_brands).to eq(original)
  end

  it "propagates to both rows of a paired category" do
    user = create(:user)

    described_class.call(user: user, category: "tire_front", brand: "Rene Herse")

    expect(user.component_category_settings.find_by(category: "tire_front").common_brands).to include("Rene Herse")
    expect(user.component_category_settings.find_by(category: "tire_rear").common_brands).to include("Rene Herse")
  end

  it "creates the category's setting row if it doesn't exist yet" do
    user = create(:user)
    user.component_category_settings.where(category: "fenders").destroy_all

    expect { described_class.call(user: user, category: "fenders", brand: "SKS") }
      .to change(user.component_category_settings, :count).by(1)
    expect(user.component_category_settings.find_by(category: "fenders").common_brands).to eq(%w[SKS])
  end
end
