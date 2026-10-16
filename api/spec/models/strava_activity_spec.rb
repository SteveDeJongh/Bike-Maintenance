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

    it "also reconciles when a bike is created with strava_gear_id already set" do
      # after_update alone would miss this — the gear-mapping screen's "create
      # new bike" flow creates the bike with strava_gear_id pre-filled, not
      # set via a later update.
      user = create(:user)
      activity = create(:strava_activity, user: user, bike_id: nil, gear_id: "g1")

      bike = create(:bike, user: user, strava_gear_id: "g1")

      expect(activity.reload.bike_id).to eq(bike.id)
    end

    it "nullifies bike_id on activities matching the old gear_id when it changes away (unlink)" do
      bike = create(:bike, strava_gear_id: "g1")
      activity = create(:strava_activity, user: bike.user, bike_id: bike.id, gear_id: "g1")

      bike.update!(strava_gear_id: nil)

      expect(activity.reload.bike_id).to be_nil
    end

    it "moves activities from the old bike to the new one when a gear is reassigned" do
      old_bike = create(:bike, strava_gear_id: "g1")
      new_bike = create(:bike, user: old_bike.user, strava_gear_id: nil)
      activity = create(:strava_activity, user: old_bike.user, bike_id: old_bike.id, gear_id: "g1")

      old_bike.update!(strava_gear_id: nil)
      new_bike.update!(strava_gear_id: "g1")

      expect(activity.reload.bike_id).to eq(new_bike.id)
    end
  end
end
