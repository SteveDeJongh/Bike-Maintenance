require "rails_helper"

RSpec.describe ComponentServiceRequirement, type: :model do
  it "is valid as a custom requirement with its own name and a distance threshold" do
    expect(build(:component_service_requirement)).to be_valid
  end

  it "is valid as a linked requirement with no values of its own (inherits from the template)" do
    template = create(:category_service_requirement)
    linked = build(:component_service_requirement, component: build(:component, user: template.user),
      category_service_requirement: template)

    expect(linked).to be_valid
    expect(linked.linked?).to be true
  end

  it "is invalid as a custom requirement without a name" do
    requirement = build(:component_service_requirement, name: nil)

    expect(requirement).not_to be_valid
    expect(requirement.errors[:name]).to be_present
  end

  it "is invalid as a linked requirement with a name set" do
    template = create(:category_service_requirement)
    requirement = build(:component_service_requirement, component: build(:component, user: template.user),
      category_service_requirement: template, name: "Not allowed")

    expect(requirement).not_to be_valid
    expect(requirement.errors[:name]).to be_present
  end

  it "is invalid as a custom requirement with neither a distance, moving time, nor calendar threshold" do
    requirement = build(:component_service_requirement, distance_meters: nil, calendar_amount: nil, calendar_unit: nil)

    expect(requirement).not_to be_valid
    expect(requirement.errors[:base]).to be_present
  end

  it "is valid as a linked requirement with no threshold of its own set" do
    template = create(:category_service_requirement)
    linked = build(:component_service_requirement, component: build(:component, user: template.user),
      category_service_requirement: template, distance_meters: nil)

    expect(linked).to be_valid
  end

  it "is invalid when the component and category_service_requirement belong to different users" do
    template = create(:category_service_requirement)
    requirement = build(:component_service_requirement, component: create(:component), category_service_requirement: template)

    expect(requirement).not_to be_valid
    expect(requirement.errors[:base]).to include(a_string_matching(/same user/))
  end

  it "allows two different custom requirements on the same component" do
    component = create(:component)
    create(:component_service_requirement, component: component, name: "Lube")
    other = build(:component_service_requirement, component: component, name: "Inspect")

    expect(other).to be_valid
  end

  describe "#linked?" do
    it "is false for a custom requirement" do
      expect(build(:component_service_requirement).linked?).to be false
    end
  end

  describe "#effective" do
    it "returns its own values for a custom requirement" do
      requirement = create(:component_service_requirement, name: "Lube", distance_interval_meters: 100_000, time_interval_days: 10)

      effective = requirement.effective
      expect(effective[:name]).to eq("Lube")
      expect(effective[:distance_meters]).to eq(100_000)
      expect(effective[:calendar_amount]).to eq(10)
      expect(effective[:calendar_unit]).to eq("day")
      expect(effective[:satisfiers].size).to eq(1)
    end

    it "falls back to the template's values for a linked requirement with no override" do
      template = create(:category_service_requirement, name: "Chain lube", distance_interval_meters: 300_000, time_interval_days: 30)
      component = create(:component, user: template.user, category: template.category)
      linked = component.component_service_requirements.find_by!(category_service_requirement: template)

      effective = linked.effective
      expect(effective[:name]).to eq("Chain lube")
      expect(effective[:distance_meters]).to eq(300_000)
      expect(effective[:calendar_amount]).to eq(30)
      expect(effective[:calendar_unit]).to eq("day")
    end

    it "uses its own override instead of the template's value when set" do
      template = create(:category_service_requirement, distance_meters: 300_000, calendar_amount: 30, calendar_unit: "day")
      component = create(:component, user: template.user, category: template.category)
      linked = component.component_service_requirements.find_by!(category_service_requirement: template)
      linked.update!(distance_meters: 150_000)

      effective = linked.effective
      expect(effective[:distance_meters]).to eq(150_000)
      expect(effective[:calendar_amount]).to eq(30)
    end

    it "adds a dimension via component override that the template never had" do
      template = create(:category_service_requirement, distance_meters: 300_000, moving_time_seconds: nil)
      component = create(:component, user: template.user, category: template.category)
      linked = component.component_service_requirements.find_by!(category_service_requirement: template)
      linked.update!(moving_time_seconds: 7_200)

      expect(linked.effective[:moving_time_seconds]).to eq(7_200)
    end

    describe "satisfier allowance resolution" do
      it "resolves a nil allowance to the requirement's own effective threshold" do
        template = create(:category_service_requirement, distance_meters: 600_000)
        hot_wax = template.satisfiers.first.service_type
        expect(template.satisfiers.first.allowance_distance_meters).to be_nil

        component = create(:component, user: template.user, category: template.category)
        linked = component.component_service_requirements.find_by!(category_service_requirement: template)

        resolved = linked.effective_satisfiers.find { |s| s[:service_type_id] == hot_wax.id }
        expect(resolved[:allowance_distance_meters]).to eq(600_000)
      end

      it "uses an explicit allowance instead of the effective threshold" do
        template = create(:category_service_requirement, distance_meters: 600_000)
        drip_wax = create(:service_type, user: template.user)
        create(:service_requirement_satisfier, owner: template, service_type: drip_wax, position: 2,
          allowance_distance_meters: 250_000)

        component = create(:component, user: template.user, category: template.category)
        linked = component.component_service_requirements.find_by!(category_service_requirement: template)

        resolved = linked.effective_satisfiers.find { |s| s[:service_type_id] == drip_wax.id }
        expect(resolved[:allowance_distance_meters]).to eq(250_000)
      end

      it "picks up a component-level threshold override in its allowance resolution" do
        template = create(:category_service_requirement, distance_meters: 600_000)
        hot_wax = template.satisfiers.first.service_type
        component = create(:component, user: template.user, category: template.category)
        linked = component.component_service_requirements.find_by!(category_service_requirement: template)
        linked.update!(distance_meters: 450_000)

        resolved = linked.effective_satisfiers.find { |s| s[:service_type_id] == hot_wax.id }
        expect(resolved[:allowance_distance_meters]).to eq(450_000)
      end
    end
  end
end
