require "rails_helper"

RSpec.describe ComponentServiceInterval, type: :model do
  it "is valid as a custom interval with its own distance set" do
    expect(build(:component_service_interval)).to be_valid
  end

  it "is valid as a linked interval with no values of its own (inherits from the template)" do
    template = create(:category_service_interval)
    linked = build(:component_service_interval, component: build(:component, user: template.user),
      category_service_interval: template, service_type: template.service_type,
      distance_interval_meters: nil, time_interval_days: nil)

    expect(linked).to be_valid
  end

  it "is invalid as a custom interval with neither a distance nor a time interval" do
    interval = build(:component_service_interval, distance_interval_meters: nil, time_interval_days: nil)

    expect(interval).not_to be_valid
    expect(interval.errors[:base]).to be_present
  end

  it "is invalid with a duplicate service_type for the same component" do
    component = create(:component)
    service_type = create(:service_type, user: component.user)
    create(:component_service_interval, component: component, service_type: service_type)
    duplicate = build(:component_service_interval, component: component, service_type: service_type)

    expect(duplicate).not_to be_valid
  end

  it "is invalid when the component and service_type belong to different users" do
    interval = build(:component_service_interval, component: create(:component), service_type: create(:service_type))

    expect(interval).not_to be_valid
    expect(interval.errors[:base]).to include(a_string_matching(/same user/))
  end

  it "is invalid when the component and category_service_interval belong to different users" do
    template = create(:category_service_interval)
    interval = build(:component_service_interval, component: create(:component),
      category_service_interval: template, service_type: template.service_type)

    expect(interval).not_to be_valid
    expect(interval.errors[:base]).to include(a_string_matching(/same user/))
  end

  it "allows two different service_types on the same component" do
    component = create(:component)
    create(:component_service_interval, component: component, service_type: create(:service_type, user: component.user))
    other = build(:component_service_interval, component: component, service_type: create(:service_type, user: component.user))

    expect(other).to be_valid
  end

  describe "#effective_distance_interval_meters / #effective_time_interval_days" do
    it "returns its own values for a custom interval" do
      interval = create(:component_service_interval, distance_interval_meters: 100_000, time_interval_days: 10)

      expect(interval.effective_distance_interval_meters).to eq(100_000)
      expect(interval.effective_time_interval_days).to eq(10)
    end

    it "falls back to the template's values for a linked interval with no override" do
      # Creating a component in the same category auto-applies the template
      # (Component#after_create), already with nil overrides -- nothing
      # more to set up.
      template = create(:category_service_interval, distance_interval_meters: 300_000, time_interval_days: 30)
      component = create(:component, user: template.user, category: template.category)
      linked = component.component_service_intervals.find_by!(service_type: template.service_type)

      expect(linked.effective_distance_interval_meters).to eq(300_000)
      expect(linked.effective_time_interval_days).to eq(30)
    end

    it "uses its own override instead of the template's value when set" do
      template = create(:category_service_interval, distance_interval_meters: 300_000, time_interval_days: 30)
      component = create(:component, user: template.user, category: template.category)
      linked = component.component_service_intervals.find_by!(service_type: template.service_type)
      linked.update!(distance_interval_meters: 150_000)

      expect(linked.effective_distance_interval_meters).to eq(150_000)
      expect(linked.effective_time_interval_days).to eq(30)
    end
  end
end
