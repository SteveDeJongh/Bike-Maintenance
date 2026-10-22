require "rails_helper"

RSpec.describe BikeComponentSlot, type: :model do
  it "is valid with a bike and category" do
    expect(build(:bike_component_slot)).to be_valid
  end

  it "is invalid without a category" do
    slot = build(:bike_component_slot, category: nil)

    expect(slot).not_to be_valid
    expect(slot.errors[:category]).to be_present
  end

  it "is invalid with a ride_context outside the known set" do
    slot = build(:bike_component_slot, ride_context: "upside_down")

    expect(slot).not_to be_valid
    expect(slot.errors[:ride_context]).to be_present
  end

  it "is invalid with a duplicate (category, ride_context) on the same bike" do
    bike = create(:bike)
    create(:bike_component_slot, bike: bike, category: "chain", ride_context: "both")
    duplicate = build(:bike_component_slot, bike: bike, category: "chain", ride_context: "both")

    expect(duplicate).not_to be_valid
  end

  it "allows the same category on different bikes" do
    create(:bike_component_slot, category: "chain")
    other_bike_slot = build(:bike_component_slot, category: "chain")

    expect(other_bike_slot).to be_valid
  end

  it "allows the same category with a different ride_context on the same bike when allowed" do
    bike = create(:bike)
    create(:component_category_setting, user: bike.user, category: "cassette", allows_multiple_assignments: true)
    create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "outdoor_only")
    indoor_slot = build(:bike_component_slot, bike: bike, category: "cassette", ride_context: "indoor_only")

    expect(indoor_slot).to be_valid
  end

  it "is invalid with a restricted ride_context for a category without allows_multiple_assignments" do
    slot = build(:bike_component_slot, category: "tire_front", ride_context: "outdoor_only")

    expect(slot).not_to be_valid
    expect(slot.errors[:ride_context]).to be_present
  end

  it "is valid with a restricted ride_context for a category with allows_multiple_assignments" do
    bike = create(:bike)
    create(:component_category_setting, user: bike.user, category: "cassette", allows_multiple_assignments: true)
    slot = build(:bike_component_slot, bike: bike, category: "cassette", ride_context: "outdoor_only")

    expect(slot).to be_valid
  end

  describe "destroy" do
    it "is destroyed when there is no active assignment for that bike and category" do
      bike = create(:bike)
      slot = create(:bike_component_slot, bike: bike, category: "chain")
      component = create(:component, user: bike.user, category: "chain")
      create(:component_assignment, bike: bike, component: component, ended_at: Time.zone.local(2026, 2, 1))

      expect(slot.destroy).to be_truthy
      expect(BikeComponentSlot.exists?(slot.id)).to be false
    end

    it "is not destroyed when an active assignment exists for that bike and category" do
      bike = create(:bike)
      slot = create(:bike_component_slot, bike: bike, category: "chain")
      component = create(:component, user: bike.user, category: "chain")
      create(:component_assignment, bike: bike, component: component, ended_at: nil)

      expect(slot.destroy).to be_falsey
      expect(slot.errors[:base]).to be_present
      expect(BikeComponentSlot.exists?(slot.id)).to be true
    end

    it "destroying a split slot is blocked only by an assignment matching its own ride_context" do
      bike = create(:bike)
      create(:component_category_setting, user: bike.user, category: "cassette", allows_multiple_assignments: true)
      outdoor_slot = create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "outdoor_only")
      create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "indoor_only")

      outdoor_component = create(:component, user: bike.user, category: "cassette")
      indoor_component = create(:component, user: bike.user, category: "cassette")
      create(:component_assignment, bike: bike, component: outdoor_component, ride_context: "outdoor_only", ended_at: nil)
      create(:component_assignment, bike: bike, component: indoor_component, ride_context: "indoor_only", ended_at: nil)

      expect(outdoor_slot.destroy).to be_falsey
      expect(BikeComponentSlot.exists?(outdoor_slot.id)).to be true
    end

    it "destroying an emptied split slot is not blocked by the other slot's still-active assignment" do
      bike = create(:bike)
      create(:component_category_setting, user: bike.user, category: "cassette", allows_multiple_assignments: true)
      outdoor_slot = create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "outdoor_only")
      create(:bike_component_slot, bike: bike, category: "cassette", ride_context: "indoor_only")

      indoor_component = create(:component, user: bike.user, category: "cassette")
      create(:component_assignment, bike: bike, component: indoor_component, ride_context: "indoor_only", ended_at: nil)

      expect(outdoor_slot.destroy).to be_truthy
      expect(BikeComponentSlot.exists?(outdoor_slot.id)).to be false
    end
  end
end
