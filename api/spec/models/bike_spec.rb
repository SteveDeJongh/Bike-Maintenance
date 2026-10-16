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

  describe "#last_ride_on" do
    it "returns the latest moved_at across the bike's strava activities" do
      bike = create(:bike)
      create(:strava_activity, bike: bike, user: bike.user, moved_at: Time.zone.local(2026, 1, 1))
      latest = create(:strava_activity, bike: bike, user: bike.user, moved_at: Time.zone.local(2026, 3, 1))

      expect(bike.last_ride_on).to eq(latest.moved_at)
    end

    it "is nil when the bike has no strava activities" do
      bike = create(:bike)

      expect(bike.last_ride_on).to be_nil
    end
  end

  describe "#average_power" do
    it "averages average_watts across only device-metered activities" do
      bike = create(:bike)
      create(:strava_activity, bike: bike, user: bike.user, device_watts: true, average_watts: 200.0)
      create(:strava_activity, bike: bike, user: bike.user, device_watts: true, average_watts: 220.0)
      # Estimated (non-metered) wattage must be excluded even though it's present.
      create(:strava_activity, bike: bike, user: bike.user, device_watts: false, average_watts: 500.0)

      expect(bike.average_power).to eq(210)
    end

    it "is nil when the bike has no device-metered activities" do
      bike = create(:bike)
      create(:strava_activity, bike: bike, user: bike.user, device_watts: false, average_watts: 300.0)

      expect(bike.average_power).to be_nil
    end

    it "is nil when the bike has no strava activities" do
      bike = create(:bike)

      expect(bike.average_power).to be_nil
    end
  end

  describe "#total_elevation_gain" do
    it "sums total_elevation_gain across the bike's strava activities" do
      bike = create(:bike)
      create(:strava_activity, bike: bike, user: bike.user, total_elevation_gain: 100.0)
      create(:strava_activity, bike: bike, user: bike.user, total_elevation_gain: 250.5)

      expect(bike.total_elevation_gain).to eq(350.5)
    end

    it "is zero when the bike has no strava activities" do
      bike = create(:bike)

      expect(bike.total_elevation_gain).to eq(0)
    end
  end

  describe "#installed_components_count" do
    it "counts only currently active component assignments" do
      bike = create(:bike)
      create(:component_assignment, bike: bike, ended_at: nil)
      create(:component_assignment, bike: bike, component: create(:component, user: bike.user, category: "cassette"),
        ended_at: Time.zone.local(2026, 2, 1))

      expect(bike.installed_components_count).to eq(1)
    end

    it "is zero when the bike has no component assignments" do
      bike = create(:bike)

      expect(bike.installed_components_count).to eq(0)
    end
  end
end
