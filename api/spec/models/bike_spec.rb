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

  it "destroys its bike component slots when destroyed" do
    bike = create(:bike)
    slot = create(:bike_component_slot, bike: bike)

    bike.destroy

    expect(BikeComponentSlot.exists?(slot.id)).to be false
  end

  describe "#total_distance" do
    it "sums distance_meters across the bike's strava activities" do
      bike = create(:bike)
      create(:strava_activity, bike: bike, user: bike.user, distance_meters: 1_000)
      create(:strava_activity, bike: bike, user: bike.user, distance_meters: 2_000)

      expect(bike.total_distance).to eq(3_000)
    end

    it "is zero when the bike has no strava activities" do
      bike = create(:bike)

      expect(bike.total_distance).to eq(0)
    end
  end

  describe "#total_moving_time" do
    it "sums moving_time across the bike's strava activities" do
      bike = create(:bike)
      create(:strava_activity, bike: bike, user: bike.user, moving_time: 1_800)
      create(:strava_activity, bike: bike, user: bike.user, moving_time: 3_600)

      expect(bike.total_moving_time).to eq(5_400)
    end

    it "is zero when the bike has no strava activities" do
      bike = create(:bike)

      expect(bike.total_moving_time).to eq(0)
    end
  end

  describe "#first_ride_on" do
    it "returns the earliest moved_at across the bike's strava activities" do
      bike = create(:bike)
      create(:strava_activity, bike: bike, user: bike.user, moved_at: Time.zone.local(2026, 3, 1))
      earliest = create(:strava_activity, bike: bike, user: bike.user, moved_at: Time.zone.local(2026, 1, 1))

      expect(bike.first_ride_on).to eq(earliest.moved_at)
    end

    it "is nil when the bike has no strava activities" do
      bike = create(:bike)

      expect(bike.first_ride_on).to be_nil
    end
  end
end
