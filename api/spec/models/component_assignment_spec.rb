require "rails_helper"

RSpec.describe ComponentAssignment, type: :model do
  it "is valid with a component, bike, and started_at" do
    expect(build(:component_assignment)).to be_valid
  end

  it "is invalid without started_at" do
    assignment = build(:component_assignment, started_at: nil)

    expect(assignment).not_to be_valid
    expect(assignment.errors[:started_at]).to be_present
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

  it "is invalid when ended_at precedes started_at" do
    assignment = build(:component_assignment, started_at: Date.new(2026, 2, 1), ended_at: Date.new(2026, 1, 1))

    expect(assignment).not_to be_valid
    expect(assignment.errors[:ended_at]).to be_present
  end

  it "is invalid when the component and bike belong to different users" do
    assignment = build(:component_assignment, component: create(:component), bike: create(:bike))

    expect(assignment).not_to be_valid
    expect(assignment.errors[:base]).to include(a_string_matching(/same user/))
  end

  describe "overlap validation for the same component" do
    it "rejects a second open-ended assignment for a component already mounted elsewhere" do
      component = create(:component)
      create(:component_assignment, component: component, bike: create(:bike, user: component.user),
        started_at: Date.new(2026, 1, 1), ended_at: nil)

      overlapping = build(:component_assignment, component: component, bike: create(:bike, user: component.user),
        started_at: Date.new(2026, 2, 1), ended_at: nil)

      expect(overlapping).not_to be_valid
      expect(overlapping.errors[:base]).to include(a_string_matching(/already assigned/))
    end

    it "allows a second assignment once the first has ended before the new one starts" do
      component = create(:component)
      create(:component_assignment, component: component, bike: create(:bike, user: component.user),
        started_at: Date.new(2026, 1, 1), ended_at: Date.new(2026, 1, 31))

      sequential = build(:component_assignment, component: component, bike: create(:bike, user: component.user),
        started_at: Date.new(2026, 2, 1), ended_at: nil)

      expect(sequential).to be_valid
    end

    it "rejects overlapping date ranges even when both have an end date" do
      component = create(:component)
      create(:component_assignment, component: component, bike: create(:bike, user: component.user),
        started_at: Date.new(2026, 1, 1), ended_at: Date.new(2026, 2, 1))

      overlapping = build(:component_assignment, component: component, bike: create(:bike, user: component.user),
        started_at: Date.new(2026, 1, 15), ended_at: Date.new(2026, 3, 1))

      expect(overlapping).not_to be_valid
    end

    it "ignores itself when checking for overlaps on update" do
      assignment = create(:component_assignment, started_at: Date.new(2026, 1, 1), ended_at: nil)

      assignment.ended_at = Date.new(2026, 6, 1)

      expect(assignment).to be_valid
    end
  end

  describe "overlap validation for the same bike + category slot" do
    it "names the conflicting component when it is still ongoing, with no earliest-date claim" do
      bike = create(:bike)
      existing = create(:component_assignment, bike: bike,
        component: create(:component, label: "Chain A", category: "chain", user: bike.user),
        started_at: Date.new(2026, 1, 1), ended_at: nil)

      overlapping = build(:component_assignment, bike: bike,
        component: create(:component, label: "Chain B", category: "chain", user: bike.user),
        started_at: Date.new(2026, 2, 1), ended_at: nil)

      expect(overlapping).not_to be_valid
      message = overlapping.errors[:base].first
      expect(message).to include("Chain A")
      expect(message).to include(existing.started_at.strftime("%B"))
      expect(message).to include("Remove or end that assignment")
      expect(message).not_to include("earliest")
    end

    it "allows different categories on the same bike to overlap" do
      bike = create(:bike)
      create(:component_assignment, bike: bike, component: create(:component, category: "chain", user: bike.user),
        started_at: Date.new(2026, 1, 1), ended_at: nil)

      different_slot = build(:component_assignment, bike: bike,
        component: create(:component, category: "cassette", user: bike.user),
        started_at: Date.new(2026, 1, 1), ended_at: nil)

      expect(different_slot).to be_valid
    end

    it "allows the same category on different bikes to overlap" do
      component_a = create(:component, category: "chain")
      component_b = create(:component, category: "chain")
      create(:component_assignment, bike: create(:bike, user: component_a.user), component: component_a,
        started_at: Date.new(2026, 1, 1), ended_at: nil)

      other_bike_assignment = build(:component_assignment, bike: create(:bike, user: component_b.user),
        component: component_b, started_at: Date.new(2026, 1, 1), ended_at: nil)

      expect(other_bike_assignment).to be_valid
    end

    it "allows a same-day chain swap where the incoming assignment starts after the outgoing one ends" do
      bike = create(:bike)
      create(:component_assignment, bike: bike, component: create(:component, category: "chain", user: bike.user),
        started_at: Time.zone.local(2026, 3, 1, 8, 0), ended_at: Time.zone.local(2026, 3, 1, 9, 0))

      swap_in = build(:component_assignment, bike: bike,
        component: create(:component, category: "chain", user: bike.user),
        started_at: Time.zone.local(2026, 3, 1, 9, 1), ended_at: nil)

      expect(swap_in).to be_valid
    end

    it "rejects a same-day chain swap when the incoming assignment starts at the exact instant the outgoing one ends" do
      bike = create(:bike)
      outgoing = create(:component_assignment, bike: bike,
        component: create(:component, label: "Chain A", category: "chain", user: bike.user),
        started_at: Time.zone.local(2026, 3, 1, 8, 0), ended_at: Time.zone.local(2026, 3, 1, 9, 0))

      swap_in = build(:component_assignment, bike: bike,
        component: create(:component, label: "Chain B", category: "chain", user: bike.user),
        started_at: Time.zone.local(2026, 3, 1, 9, 0), ended_at: nil)

      expect(swap_in).not_to be_valid
      message = swap_in.errors[:base].first
      expect(message).to include("Chain A")
      expect(message).to include("earliest this component can be installed")
      expect(message).to include(outgoing.ended_at.strftime("%-I:%M %p"))
    end

    it "names the specific conflicting assignment when more than one exists, ordered by started_at" do
      bike = create(:bike)
      create(:component_assignment, bike: bike,
        component: create(:component, label: "Chain A", category: "chain", user: bike.user),
        started_at: Date.new(2026, 1, 1), ended_at: Date.new(2026, 1, 31))
      create(:component_assignment, bike: bike,
        component: create(:component, label: "Chain B", category: "chain", user: bike.user),
        started_at: Date.new(2026, 3, 1), ended_at: Date.new(2026, 3, 31))

      spanning = build(:component_assignment, bike: bike,
        component: create(:component, label: "Chain C", category: "chain", user: bike.user),
        started_at: Date.new(2026, 1, 15), ended_at: Date.new(2026, 4, 1))

      expect(spanning).not_to be_valid
      expect(spanning.errors[:base].first).to include("Chain A")
    end

    it "reports the same message when editing an existing assignment's started_at into a conflict" do
      bike = create(:bike)
      create(:component_assignment, bike: bike,
        component: create(:component, label: "Chain A", category: "chain", user: bike.user),
        started_at: Date.new(2026, 1, 1), ended_at: Date.new(2026, 1, 31))

      being_edited = create(:component_assignment, bike: bike,
        component: create(:component, label: "Chain B", category: "chain", user: bike.user),
        started_at: Date.new(2026, 2, 1), ended_at: nil)

      being_edited.started_at = Date.new(2026, 1, 15)

      expect(being_edited).not_to be_valid
      expect(being_edited.errors[:base].first).to include("Chain A")
    end
  end

  describe "per-installation-period stats" do
    it "sums distance/time/elevation only within this assignment's own window" do
      bike = create(:bike)
      assignment = create(:component_assignment, bike: bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 1, 31, 23, 59))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 15, 9, 0),
        distance_meters: 5_000, moving_time: 1_800, total_elevation_gain: 100.0)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1, 9, 0),
        distance_meters: 9_999, moving_time: 3_600, total_elevation_gain: 200.0)

      expect(assignment.distance_meters).to eq(5_000)
      expect(assignment.moving_time).to eq(1_800)
      expect(assignment.elevation_gain).to eq(100.0)
    end

    it "includes activity after started_at with no end when still ongoing" do
      bike = create(:bike)
      assignment = create(:component_assignment, bike: bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 3, 1), distance_meters: 7_000)

      expect(assignment.distance_meters).to eq(7_000)
    end

    describe "#average_power" do
      it "averages only device-metered activities within this assignment's window" do
        bike = create(:bike)
        assignment = create(:component_assignment, bike: bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
        create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5),
          device_watts: true, average_watts: 200.0)
        create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 6),
          device_watts: false, average_watts: 500.0)

        expect(assignment.average_power).to eq(200)
      end

      it "is nil when there are no device-metered activities in the window" do
        bike = create(:bike)
        assignment = create(:component_assignment, bike: bike,
          started_at: Time.zone.local(2026, 1, 1), ended_at: nil)

        expect(assignment.average_power).to be_nil
      end
    end
  end
end
