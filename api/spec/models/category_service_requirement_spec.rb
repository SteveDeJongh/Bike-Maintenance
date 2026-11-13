require "rails_helper"

RSpec.describe CategoryServiceRequirement, type: :model do
  it "is valid with a user, category, name, and a distance threshold" do
    expect(build(:category_service_requirement)).to be_valid
  end

  it "is valid with only a calendar threshold set" do
    requirement = build(:category_service_requirement, distance_meters: nil, calendar_amount: 1, calendar_unit: "month")

    expect(requirement).to be_valid
  end

  it "is invalid without a category" do
    requirement = build(:category_service_requirement, category: nil)

    expect(requirement).not_to be_valid
    expect(requirement.errors[:category]).to be_present
  end

  it "is invalid without a name" do
    requirement = build(:category_service_requirement, name: nil)

    expect(requirement).not_to be_valid
    expect(requirement.errors[:name]).to be_present
  end

  it "is invalid with a duplicate name for the same user and category, case-insensitively" do
    user = create(:user)
    create(:category_service_requirement, user: user, category: "chain", name: "Chain lube")
    duplicate = build(:category_service_requirement, user: user, category: "chain", name: "chain LUBE")

    expect(duplicate).not_to be_valid
  end

  it "allows the same name for a different category, same user" do
    user = create(:user)
    create(:category_service_requirement, user: user, category: "chain", name: "Lube")
    other_category = build(:category_service_requirement, user: user, category: "cassette", name: "Lube")

    expect(other_category).to be_valid
  end

  it "allows the same name and category for a different user" do
    create(:category_service_requirement, category: "chain", name: "Chain lube")
    other_user = build(:category_service_requirement, category: "chain", name: "Chain lube")

    expect(other_user).to be_valid
  end

  it "is invalid with neither a distance, moving time, nor calendar threshold" do
    requirement = build(:category_service_requirement, distance_meters: nil, calendar_amount: nil, calendar_unit: nil)

    expect(requirement).not_to be_valid
    expect(requirement.errors[:base]).to be_present
  end

  it "is valid with only moving_time_seconds set" do
    requirement = build(:category_service_requirement, distance_meters: nil, moving_time_seconds: 3600)

    expect(requirement).to be_valid
  end

  it "is invalid with calendar_amount but no calendar_unit" do
    requirement = build(:category_service_requirement, calendar_amount: 6, calendar_unit: nil)

    expect(requirement).not_to be_valid
    expect(requirement.errors[:base]).to be_present
  end

  it "is invalid with calendar_unit but no calendar_amount" do
    requirement = build(:category_service_requirement, calendar_amount: nil, calendar_unit: "month")

    expect(requirement).not_to be_valid
    expect(requirement.errors[:base]).to be_present
  end

  it "is invalid with a calendar_unit outside the known set" do
    requirement = build(:category_service_requirement, calendar_amount: 1, calendar_unit: "fortnight")

    expect(requirement).not_to be_valid
    expect(requirement.errors[:calendar_unit]).to be_present
  end

  it "is invalid with a ride_filter outside the known set" do
    requirement = build(:category_service_requirement, ride_filter: "uphill_only")

    expect(requirement).not_to be_valid
    expect(requirement.errors[:ride_filter]).to be_present
  end

  it "defaults ride_filter to all" do
    expect(create(:category_service_requirement).ride_filter).to eq("all")
  end

  it "cascades to destroy its linked component service requirements when destroyed" do
    # Creating a component in the same category auto-applies the template
    # (Component#after_create -- see apply_category_service_requirements),
    # so the linked row already exists.
    template = create(:category_service_requirement)
    component = create(:component, user: template.user, category: template.category)
    linked = component.component_service_requirements.find_by!(category_service_requirement: template)

    template.destroy!

    expect(ComponentServiceRequirement.exists?(linked.id)).to be false
  end

  it "destroys itself even with exactly one satisfier (regression: satisfiers use dependent: :delete_all, not :destroy)" do
    template = create(:category_service_requirement)
    satisfier_id = template.satisfiers.sole.id

    expect { template.destroy! }.not_to raise_error
    expect(ServiceRequirementSatisfier.exists?(satisfier_id)).to be false
  end
end
