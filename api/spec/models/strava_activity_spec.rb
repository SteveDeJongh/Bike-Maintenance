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

  describe ".indoor / .outdoor" do
    it "treats a trainer: true activity as indoor" do
      activity = create(:strava_activity, trainer: true, activity_type: "Ride")

      expect(StravaActivity.indoor).to include(activity)
      expect(StravaActivity.outdoor).not_to include(activity)
    end

    it "treats a VirtualRide activity as indoor even when trainer is false" do
      # The real-world Zwift shape: Strava's own trainer flag is not set,
      # but activity_type is the trustworthy signal.
      activity = create(:strava_activity, trainer: false, activity_type: "VirtualRide")

      expect(StravaActivity.indoor).to include(activity)
      expect(StravaActivity.outdoor).not_to include(activity)
    end

    it "treats a plain Ride with trainer false as outdoor" do
      activity = create(:strava_activity, trainer: false, activity_type: "Ride")

      expect(StravaActivity.outdoor).to include(activity)
      expect(StravaActivity.indoor).not_to include(activity)
    end
  end

  describe "#indoor?" do
    it "mirrors the indoor/outdoor scopes for a single record" do
      expect(build(:strava_activity, trainer: true, activity_type: "Ride")).to be_indoor
      expect(build(:strava_activity, trainer: false, activity_type: "VirtualRide")).to be_indoor
      expect(build(:strava_activity, trainer: false, activity_type: "Ride")).not_to be_indoor
    end
  end

  describe "#ride_kind" do
    it "returns outdoor, trainer, or virtual, matching indoor? == (ride_kind != 'outdoor') across fixtures" do
      fixtures = [
        build(:strava_activity, trainer: false, activity_type: "Ride"),
        build(:strava_activity, trainer: true, activity_type: "Ride"),
        build(:strava_activity, trainer: false, activity_type: "VirtualRide"),
        build(:strava_activity, trainer: true, activity_type: "VirtualRide"),
      ]

      expect(fixtures.map(&:ride_kind)).to eq(%w[outdoor trainer virtual virtual])
      fixtures.each do |activity|
        expect(activity.indoor?).to eq(activity.ride_kind != "outdoor")
      end
    end
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

    it "clears ignored_at on activities it attributes, even though it uses update_all" do
      bike = create(:bike, strava_gear_id: "g1")
      activity = create(:strava_activity, user: bike.user, bike_id: nil, gear_id: "g1", ignored_at: Time.current)

      StravaActivity.reconcile_for_bike!(bike)

      expect(activity.reload.ignored_at).to be_nil
    end
  end

  describe "#ignored_at" do
    describe "ignored/not_ignored scopes" do
      it "splits activities by whether ignored_at is set" do
        ignored = create(:strava_activity, bike_id: nil, ignored_at: Time.current)
        not_ignored = create(:strava_activity, bike_id: nil, ignored_at: nil)

        expect(described_class.ignored).to contain_exactly(ignored)
        expect(described_class.not_ignored).to contain_exactly(not_ignored)
      end
    end

    describe "#not_ignored_while_attributed validation" do
      it "is invalid when ignored_at is set on an activity with a bike_id" do
        bike = create(:bike)
        activity = build(:strava_activity, user: bike.user, bike: bike, ignored_at: Time.current)

        expect(activity).not_to be_valid
        expect(activity.errors[:ignored_at]).to be_present
      end

      it "is valid to set ignored_at while unattributed" do
        activity = build(:strava_activity, bike_id: nil, ignored_at: Time.current)

        expect(activity).to be_valid
      end

      it "is valid to clear ignored_at while attributed" do
        bike = create(:bike)
        activity = build(:strava_activity, user: bike.user, bike: bike, ignored_at: nil)

        expect(activity).to be_valid
      end
    end
  end

  describe ".needs_attention_for" do
    it "includes an unattributed, unignored ride with no gear_id" do
      user = create(:user)
      ride = create(:strava_activity, user: user, bike_id: nil, gear_id: nil)

      expect(described_class.needs_attention_for(user)).to contain_exactly(ride)
    end

    it "includes an unattributed, unignored ride with an unmapped gear_id" do
      user = create(:user)
      ride = create(:strava_activity, user: user, bike_id: nil, gear_id: "g1")

      expect(described_class.needs_attention_for(user)).to contain_exactly(ride)
    end

    it "excludes an attributed ride" do
      bike = create(:bike)
      create(:strava_activity, user: bike.user, bike: bike)

      expect(described_class.needs_attention_for(bike.user)).to be_empty
    end

    it "excludes a ride-ignored ride" do
      user = create(:user)
      create(:strava_activity, user: user, bike_id: nil, ignored_at: Time.current)

      expect(described_class.needs_attention_for(user)).to be_empty
    end

    it "excludes a ride whose gear is ignored and hasn't resurfaced" do
      user = create(:user)
      create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: Time.current)
      create(:strava_activity, user: user, bike_id: nil, gear_id: "g1", moved_at: 1.day.ago)

      expect(described_class.needs_attention_for(user)).to be_empty
    end

    it "includes a ride whose gear is ignored but has resurfaced" do
      user = create(:user)
      create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: 10.days.ago)
      ride = create(:strava_activity, user: user, bike_id: nil, gear_id: "g1", moved_at: 1.day.ago)

      expect(described_class.needs_attention_for(user)).to contain_exactly(ride)
    end

    it "never includes another user's rides" do
      create(:strava_activity, bike_id: nil)

      expect(described_class.needs_attention_for(create(:user))).to be_empty
    end
  end

  describe ".ignored_for" do
    it "includes a ride-ignored, unattributed ride" do
      user = create(:user)
      ride = create(:strava_activity, user: user, bike_id: nil, ignored_at: Time.current)

      expect(described_class.ignored_for(user)).to contain_exactly(ride)
    end

    it "includes a ride whose gear is ignored and hasn't resurfaced" do
      user = create(:user)
      create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: Time.current)
      ride = create(:strava_activity, user: user, bike_id: nil, gear_id: "g1", moved_at: 10.days.ago)

      expect(described_class.ignored_for(user)).to contain_exactly(ride)
    end

    it "excludes a ride whose gear is ignored but has resurfaced" do
      user = create(:user)
      create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: 10.days.ago)
      create(:strava_activity, user: user, bike_id: nil, gear_id: "g1", moved_at: 1.day.ago)

      expect(described_class.ignored_for(user)).to be_empty
    end

    it "excludes a needs-attention ride" do
      user = create(:user)
      create(:strava_activity, user: user, bike_id: nil, gear_id: nil)

      expect(described_class.ignored_for(user)).to be_empty
    end

    it "excludes an attributed ride" do
      bike = create(:bike)
      create(:strava_activity, user: bike.user, bike: bike)

      expect(described_class.ignored_for(bike.user)).to be_empty
    end

    it "never includes another user's rides" do
      create(:strava_activity, bike_id: nil, ignored_at: Time.current)

      expect(described_class.ignored_for(create(:user))).to be_empty
    end
  end

  describe "#attribution_status and #reason" do
    it "classifies an attributed ride, with a nil reason" do
      bike = create(:bike)
      ride = build(:strava_activity, user: bike.user, bike: bike)

      expect(ride.attribution_status([])).to eq("attributed")
      expect(ride.reason([])).to be_nil
    end

    it "classifies an unattributed ride with an unmapped gear_id as needs_attention/unmapped_gear" do
      ride = build(:strava_activity, bike_id: nil, gear_id: "g1")

      expect(ride.attribution_status([])).to eq("needs_attention")
      expect(ride.reason([])).to eq("unmapped_gear")
    end

    it "classifies an unattributed ride with no gear_id as needs_attention/no_gear" do
      ride = build(:strava_activity, bike_id: nil, gear_id: nil)

      expect(ride.attribution_status([])).to eq("needs_attention")
      expect(ride.reason([])).to eq("no_gear")
    end

    it "classifies a ride-ignored ride as ignored/ride, even with a gear_id in the ignored set" do
      ride = build(:strava_activity, bike_id: nil, gear_id: "g1", ignored_at: Time.current)

      expect(ride.attribution_status(["g1"])).to eq("ignored")
      expect(ride.reason(["g1"])).to eq("ride")
    end

    it "classifies a gear-ignored ride as ignored/gear" do
      ride = build(:strava_activity, bike_id: nil, gear_id: "g1", ignored_at: nil)

      expect(ride.attribution_status(["g1"])).to eq("ignored")
      expect(ride.reason(["g1"])).to eq("gear")
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
