require "rails_helper"

RSpec.describe ComponentAssignment, type: :model do
  it "is valid with a component, bike, and started_on" do
    expect(build(:component_assignment)).to be_valid
  end

  it "is invalid without started_on" do
    assignment = build(:component_assignment, started_on: nil)

    expect(assignment).not_to be_valid
    expect(assignment.errors[:started_on]).to be_present
  end

  it "is invalid without a component" do
    assignment = build(:component_assignment, component: nil)

    expect(assignment).not_to be_valid
    expect(assignment.errors[:component]).to be_present
  end

  it "is invalid without a bike" do
    assignment = build(:component_assignment, bike: nil)

    expect(assignment).not_to be_valid
    expect(assignment.errors[:bike]).to be_present
  end

  it "is invalid when ended_on precedes started_on" do
    assignment = build(:component_assignment, started_on: Date.new(2026, 2, 1), ended_on: Date.new(2026, 1, 1))

    expect(assignment).not_to be_valid
    expect(assignment.errors[:ended_on]).to be_present
  end

  describe "overlap validation for the same component" do
    it "rejects a second open-ended assignment for a component already mounted elsewhere" do
      component = create(:component)
      create(:component_assignment, component: component, bike: create(:bike), started_on: Date.new(2026, 1, 1), ended_on: nil)

      overlapping = build(:component_assignment, component: component, bike: create(:bike), started_on: Date.new(2026, 2, 1), ended_on: nil)

      expect(overlapping).not_to be_valid
      expect(overlapping.errors[:base]).to include(a_string_matching(/already assigned/))
    end

    it "allows a second assignment once the first has ended before the new one starts" do
      component = create(:component)
      create(:component_assignment, component: component, bike: create(:bike), started_on: Date.new(2026, 1, 1), ended_on: Date.new(2026, 1, 31))

      sequential = build(:component_assignment, component: component, bike: create(:bike), started_on: Date.new(2026, 2, 1), ended_on: nil)

      expect(sequential).to be_valid
    end

    it "rejects overlapping date ranges even when both have an end date" do
      component = create(:component)
      create(:component_assignment, component: component, bike: create(:bike), started_on: Date.new(2026, 1, 1), ended_on: Date.new(2026, 2, 1))

      overlapping = build(:component_assignment, component: component, bike: create(:bike), started_on: Date.new(2026, 1, 15), ended_on: Date.new(2026, 3, 1))

      expect(overlapping).not_to be_valid
    end

    it "ignores itself when checking for overlaps on update" do
      assignment = create(:component_assignment, started_on: Date.new(2026, 1, 1), ended_on: nil)

      assignment.ended_on = Date.new(2026, 6, 1)

      expect(assignment).to be_valid
    end
  end

  describe "overlap validation for the same bike + category slot" do
    it "rejects a different component of the same category overlapping on the same bike" do
      bike = create(:bike)
      create(:component_assignment, bike: bike, component: create(:component, category: "chain"), started_on: Date.new(2026, 1, 1), ended_on: nil)

      overlapping = build(:component_assignment, bike: bike, component: create(:component, category: "chain"), started_on: Date.new(2026, 2, 1), ended_on: nil)

      expect(overlapping).not_to be_valid
      expect(overlapping.errors[:base]).to include(a_string_matching(/already has a chain/))
    end

    it "allows different categories on the same bike to overlap" do
      bike = create(:bike)
      create(:component_assignment, bike: bike, component: create(:component, category: "chain"), started_on: Date.new(2026, 1, 1), ended_on: nil)

      different_slot = build(:component_assignment, bike: bike, component: create(:component, category: "cassette"), started_on: Date.new(2026, 1, 1), ended_on: nil)

      expect(different_slot).to be_valid
    end

    it "allows the same category on different bikes to overlap" do
      component_a = create(:component, category: "chain")
      component_b = create(:component, category: "chain")
      create(:component_assignment, bike: create(:bike), component: component_a, started_on: Date.new(2026, 1, 1), ended_on: nil)

      other_bike_assignment = build(:component_assignment, bike: create(:bike), component: component_b, started_on: Date.new(2026, 1, 1), ended_on: nil)

      expect(other_bike_assignment).to be_valid
    end

    it "allows a chain swap where the outgoing chain's assignment ends the day the incoming one starts" do
      bike = create(:bike)
      create(:component_assignment, bike: bike, component: create(:component, category: "chain"), started_on: Date.new(2026, 1, 1), ended_on: Date.new(2026, 3, 1))

      swap_in = build(:component_assignment, bike: bike, component: create(:component, category: "chain"), started_on: Date.new(2026, 3, 2), ended_on: nil)

      expect(swap_in).to be_valid
    end
  end
end
