require "rails_helper"

RSpec.describe ServiceTypeCategory, type: :model do
  it "is valid with a service type and category" do
    expect(build(:service_type_category)).to be_valid
  end

  it "requires a category" do
    tag = build(:service_type_category, category: "")

    expect(tag).not_to be_valid
    expect(tag.errors[:category]).to be_present
  end

  it "is unique per (service type, category)" do
    existing = create(:service_type_category, category: "chain")
    duplicate = build(:service_type_category, service_type: existing.service_type, category: "chain")

    expect(duplicate).not_to be_valid
  end

  it "allows the same category on different service types" do
    create(:service_type_category, category: "chain")

    expect(build(:service_type_category, category: "chain")).to be_valid
  end

  it "has a unique index behind the validation" do
    existing = create(:service_type_category, category: "chain")

    expect {
      ServiceTypeCategory.insert_all!([{ service_type_id: existing.service_type_id, category: "chain" }])
    }.to raise_error(ActiveRecord::RecordNotUnique)
  end
end
