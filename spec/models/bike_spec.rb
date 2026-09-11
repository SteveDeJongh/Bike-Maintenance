require "rails_helper"

RSpec.describe Bike, type: :model do
  it "is valid with a name" do
    expect(build(:bike, name: "Cervelo Soloist")).to be_valid
  end

  it "is invalid without a name" do
    bike = build(:bike, name: nil)

    expect(bike).not_to be_valid
    expect(bike.errors[:name]).to be_present
  end

  it "destroys its component assignments when destroyed" do
    bike = create(:bike)
    assignment = create(:component_assignment, bike: bike)

    bike.destroy

    expect(ComponentAssignment.exists?(assignment.id)).to be false
  end
end
