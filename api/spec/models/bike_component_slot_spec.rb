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

  it "is invalid with a duplicate category on the same bike" do
    bike = create(:bike)
    create(:bike_component_slot, bike: bike, category: "chain")
    duplicate = build(:bike_component_slot, bike: bike, category: "chain")

    expect(duplicate).not_to be_valid
  end

  it "allows the same category on different bikes" do
    create(:bike_component_slot, category: "chain")
    other_bike_slot = build(:bike_component_slot, category: "chain")

    expect(other_bike_slot).to be_valid
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
  end
end
