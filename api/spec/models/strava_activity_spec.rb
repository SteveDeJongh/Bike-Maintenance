require "rails_helper"

RSpec.describe StravaActivity, type: :model do
  it "is valid with a user, strava_id, distance_meters, and moved_at" do
    expect(build(:strava_activity)).to be_valid
  end

  it "is invalid without a strava_id" do
    activity = build(:strava_activity, strava_id: nil)

    expect(activity).not_to be_valid
    expect(activity.errors[:strava_id]).to be_present
  end

  it "is invalid with a duplicate strava_id" do
    create(:strava_activity, strava_id: 42)
    activity = build(:strava_activity, strava_id: 42)

    expect(activity).not_to be_valid
    expect(activity.errors[:strava_id]).to be_present
  end

  describe ".reconcile_for_bike!" do
    it "backfills bike_id for activities matching the bike's gear_id and user" do
      bike = create(:bike, strava_gear_id: "g1")
      matching = create(:strava_activity, user: bike.user, bike_id: nil, gear_id: "g1")
      other_gear = create(:strava_activity, user: bike.user, bike_id: nil, gear_id: "g2")
      other_user = create(:strava_activity, gear_id: "g1")

      StravaActivity.reconcile_for_bike!(bike)

      expect(matching.reload.bike_id).to eq(bike.id)
      expect(other_gear.reload.bike_id).to be_nil
      expect(other_user.reload.bike_id).not_to eq(bike.id)
    end

    it "does nothing when the bike has no strava_gear_id" do
      bike = create(:bike, strava_gear_id: nil)
      activity = create(:strava_activity, user: bike.user, bike_id: nil, gear_id: "g1")

      StravaActivity.reconcile_for_bike!(bike)

      expect(activity.reload.bike_id).to be_nil
    end
  end

  describe "Bike#strava_gear_id changing" do
    it "retroactively maps previously-unmapped activities with the matching gear_id" do
      bike = create(:bike, strava_gear_id: nil)
      activity = create(:strava_activity, user: bike.user, bike_id: nil, gear_id: "g1")

      bike.update!(strava_gear_id: "g1")

      expect(activity.reload.bike_id).to eq(bike.id)
    end
  end
end
