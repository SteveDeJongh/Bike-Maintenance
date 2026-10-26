require "rails_helper"

RSpec.describe ComponentServiceInterval, type: :model do
  it "is valid as a custom interval with its own distance set" do
    expect(build(:component_service_interval)).to be_valid
  end

  it "is valid as a linked interval with no values of its own (inherits from the template)" do
    template = create(:category_service_interval)
    linked = build(:component_service_interval, category_service_interval: template, service_type: template.service_type,
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
      template = create(:category_service_interval, distance_interval_meters: 300_000, time_interval_days: 30)
      linked = create(:component_service_interval, category_service_interval: template, service_type: template.service_type,
        distance_interval_meters: nil, time_interval_days: nil)

      expect(linked.effective_distance_interval_meters).to eq(300_000)
      expect(linked.effective_time_interval_days).to eq(30)
    end

    it "uses its own override instead of the template's value when set" do
      template = create(:category_service_interval, distance_interval_meters: 300_000, time_interval_days: 30)
      linked = create(:component_service_interval, category_service_interval: template, service_type: template.service_type,
        distance_interval_meters: 150_000, time_interval_days: nil)

      expect(linked.effective_distance_interval_meters).to eq(150_000)
      expect(linked.effective_time_interval_days).to eq(30)
    end
  end
end
