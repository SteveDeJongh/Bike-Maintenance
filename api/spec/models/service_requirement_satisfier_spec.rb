require "rails_helper"

RSpec.describe ServiceRequirementSatisfier, type: :model do
  it "is valid with an owner, service_type, and position" do
    expect(build(:service_requirement_satisfier)).to be_valid
  end

  it "is invalid without a position" do
    satisfier = build(:service_requirement_satisfier, position: nil)

    expect(satisfier).not_to be_valid
    expect(satisfier.errors[:position]).to be_present
  end

  it "is invalid with a duplicate service_type for the same owner" do
    template = create(:category_service_requirement)
    service_type = template.satisfiers.first.service_type
    duplicate = build(:service_requirement_satisfier, owner: template, service_type: service_type, position: 2)

    expect(duplicate).not_to be_valid
  end

  it "allows the same service_type on two different owners" do
    service_type = create(:service_type)
    template_a = create(:category_service_requirement, user: service_type.user, service_type: service_type)
    template_b = create(:category_service_requirement, user: service_type.user, service_type: service_type)

    expect(template_a.satisfiers.first.service_type).to eq(service_type)
    expect(template_b.satisfiers.first.service_type).to eq(service_type)
  end

  describe "owner restriction" do
    it "is valid when the owner is a category service requirement (template)" do
      expect(build(:service_requirement_satisfier)).to be_valid
    end

    it "is valid when the owner is an unlinked (custom) component service requirement" do
      custom = create(:component_service_requirement, service_type: nil)
      satisfier = build(:service_requirement_satisfier, owner: custom, service_type: create(:service_type, user: custom.component.user), position: 2)

      expect(satisfier).to be_valid
    end

    it "is invalid when the owner is a linked component service requirement" do
      template = create(:category_service_requirement)
      component = create(:component, user: template.user, category: template.category)
      linked = component.component_service_requirements.find_by!(category_service_requirement: template)

      satisfier = build(:service_requirement_satisfier, owner: linked, service_type: create(:service_type, user: template.user))

      expect(satisfier).not_to be_valid
      expect(satisfier.errors[:base]).to include(a_string_matching(/template's satisfiers/))
    end
  end

  describe "service_type ownership" do
    it "is invalid when the service_type belongs to a different user than the template owner" do
      satisfier = build(:service_requirement_satisfier, owner: create(:category_service_requirement), service_type: create(:service_type))

      expect(satisfier).not_to be_valid
      expect(satisfier.errors[:base]).to include(a_string_matching(/same user/))
    end

    it "is invalid when the service_type belongs to a different user than the component owner" do
      custom = create(:component_service_requirement, service_type: nil)
      satisfier = build(:service_requirement_satisfier, owner: custom, service_type: create(:service_type), position: 2)

      expect(satisfier).not_to be_valid
      expect(satisfier.errors[:base]).to include(a_string_matching(/same user/))
    end
  end

  describe "allowance dimension validation" do
    it "rejects a distance allowance when the owner has no distance threshold" do
      template = create(:category_service_requirement, distance_meters: nil, calendar_amount: 1, calendar_unit: "month")
      satisfier = build(:service_requirement_satisfier, owner: template,
        service_type: create(:service_type, user: template.user), position: 2, allowance_distance_meters: 100_000)

      expect(satisfier).not_to be_valid
      expect(satisfier.errors[:allowance_distance_meters]).to be_present
    end

    it "rejects a moving_time allowance when the owner has no moving_time threshold" do
      template = create(:category_service_requirement, moving_time_seconds: nil)
      satisfier = build(:service_requirement_satisfier, owner: template,
        service_type: create(:service_type, user: template.user), position: 2, allowance_moving_time_seconds: 3_600)

      expect(satisfier).not_to be_valid
      expect(satisfier.errors[:allowance_moving_time_seconds]).to be_present
    end

    it "rejects a calendar allowance when the owner has no calendar threshold" do
      template = create(:category_service_requirement, calendar_amount: nil, calendar_unit: nil)
      satisfier = build(:service_requirement_satisfier, owner: template,
        service_type: create(:service_type, user: template.user), position: 2,
        allowance_calendar_amount: 6, allowance_calendar_unit: "month")

      expect(satisfier).not_to be_valid
      expect(satisfier.errors[:allowance_calendar_amount]).to be_present
    end

    it "allows an allowance on a dimension the owner does have a threshold for" do
      template = create(:category_service_requirement, distance_meters: 600_000)
      satisfier = build(:service_requirement_satisfier, owner: template,
        service_type: create(:service_type, user: template.user), position: 2, allowance_distance_meters: 250_000)

      expect(satisfier).to be_valid
    end
  end

  describe "destroying the last satisfier" do
    it "blocks a direct destroy of an owner's only satisfier" do
      template = create(:category_service_requirement)
      satisfier = template.satisfiers.sole

      expect(satisfier.destroy).to be false
      expect(satisfier.errors[:base]).to include(a_string_matching(/needs at least one/))
      expect(ServiceRequirementSatisfier.exists?(satisfier.id)).to be true
    end

    it "allows destroying one of two satisfiers" do
      template = create(:category_service_requirement)
      second = create(:service_requirement_satisfier, owner: template,
        service_type: create(:service_type, user: template.user), position: 2)

      expect(second.destroy).to be_truthy
      expect(template.satisfiers.count).to eq(1)
    end

    it "does not block destroying the owner itself, even with exactly one satisfier (dependent: :delete_all regression)" do
      template = create(:category_service_requirement)
      satisfier_id = template.satisfiers.sole.id

      expect { template.destroy! }.not_to raise_error
      expect(ServiceRequirementSatisfier.exists?(satisfier_id)).to be false
    end

    it "does not block destroying a custom component requirement with exactly one satisfier" do
      custom = create(:component_service_requirement, service_type: nil)
      satisfier_id = custom.satisfiers.sole.id

      expect { custom.destroy! }.not_to raise_error
      expect(ServiceRequirementSatisfier.exists?(satisfier_id)).to be false
    end
  end
end
