require "rails_helper"

RSpec.describe Bikes::ServiceableComponents do
  describe ".call" do
    it "returns what was mounted at a backdated time, not what's mounted now" do
      bike = create(:bike)
      component_a = create(:component, user: bike.user, label: "Wheel A", category: "wheel_front")
      component_b = create(:component, user: bike.user, label: "Wheel B", category: "wheel_rear")
      create(:component_assignment, bike: bike, component: component_a,
        started_at: Time.zone.local(2026, 1, 1, 8, 0), ended_at: Time.zone.local(2026, 1, 9, 8, 0))
      create(:component_assignment, bike: bike, component: component_b,
        started_at: Time.zone.local(2026, 1, 9, 8, 0), ended_at: nil)

      # Tuesday the 6th -- wheel A was still on, wheel B hadn't gone on yet.
      result = described_class.call(bike, at: Time.zone.local(2026, 1, 6, 12, 0))

      expect(result.mounted.map(&:id)).to eq([ component_a.id ])
      expect(result.mounted.map(&:id)).not_to include(component_b.id)
    end

    it "lists a component as off this bike once its assignment here has ended and nothing new started" do
      bike = create(:bike)
      component = create(:component, user: bike.user)
      create(:component_assignment, bike: bike, component: component,
        started_at: Time.zone.local(2026, 1, 1, 8, 0), ended_at: Time.zone.local(2026, 1, 5, 8, 0))

      result = described_class.call(bike, at: Time.zone.local(2026, 1, 10, 0, 0))

      expect(result.off_bike.map(&:id)).to eq([ component.id ])
      expect(result.mounted).to be_empty
    end

    it "no longer lists a component as off this bike once it's been remounted on a different bike" do
      bike = create(:bike)
      other_bike = create(:bike, user: bike.user)
      component = create(:component, user: bike.user)
      create(:component_assignment, bike: bike, component: component,
        started_at: Time.zone.local(2026, 1, 1, 8, 0), ended_at: Time.zone.local(2026, 1, 5, 8, 0))
      create(:component_assignment, bike: other_bike, component: component,
        started_at: Time.zone.local(2026, 1, 6, 8, 0), ended_at: Time.zone.local(2026, 1, 8, 8, 0))

      at = Time.zone.local(2026, 1, 10, 0, 0)
      result = described_class.call(bike, at: at)
      other_result = described_class.call(other_bike, at: at)

      expect(result.off_bike.map(&:id)).to be_empty
      expect(other_result.off_bike.map(&:id)).to eq([ component.id ])
    end

    it "excludes a component retired before at" do
      bike = create(:bike)
      component = create(:component, user: bike.user,
        retired_on: Date.new(2026, 1, 3))
      create(:component_assignment, bike: bike, component: component,
        started_at: Time.zone.local(2026, 1, 1, 8, 0), ended_at: Time.zone.local(2026, 1, 2, 8, 0))

      result = described_class.call(bike, at: Time.zone.local(2026, 1, 10, 0, 0))

      expect(result.off_bike).to be_empty
    end

    it "excludes a component retired earlier the same day as at" do
      bike = create(:bike)
      component = create(:component, user: bike.user, retired_on: Date.new(2026, 1, 5))
      create(:component_assignment, bike: bike, component: component,
        started_at: Time.zone.local(2026, 1, 1, 8, 0), ended_at: Time.zone.local(2026, 1, 2, 8, 0))

      result = described_class.call(bike, at: Time.zone.local(2026, 1, 5, 18, 0))

      expect(result.off_bike).to be_empty
    end

    it "includes a component retired after at (backdating before a later retirement)" do
      bike = create(:bike)
      component = create(:component, user: bike.user, retired_on: Date.new(2026, 1, 9))
      create(:component_assignment, bike: bike, component: component,
        started_at: Time.zone.local(2026, 1, 1, 8, 0), ended_at: Time.zone.local(2026, 1, 2, 8, 0))

      result = described_class.call(bike, at: Time.zone.local(2026, 1, 5, 12, 0))

      expect(result.off_bike.map(&:id)).to eq([ component.id ])
    end
  end
end
