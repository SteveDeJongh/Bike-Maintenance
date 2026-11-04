require "rails_helper"

RSpec.describe StravaGear, type: :model do
  it "is valid with a user and strava_gear_id" do
    expect(build(:strava_gear)).to be_valid
  end

  it "is invalid without a strava_gear_id" do
    gear = build(:strava_gear, strava_gear_id: nil)

    expect(gear).not_to be_valid
    expect(gear.errors[:strava_gear_id]).to be_present
  end

  it "is invalid with a duplicate strava_gear_id for the same user" do
    user = create(:user)
    create(:strava_gear, user: user, strava_gear_id: "b1")
    duplicate = build(:strava_gear, user: user, strava_gear_id: "b1")

    expect(duplicate).not_to be_valid
    expect(duplicate.errors[:strava_gear_id]).to be_present
  end

  it "allows the same strava_gear_id for different users" do
    create(:strava_gear, strava_gear_id: "b1")
    other = build(:strava_gear, strava_gear_id: "b1")

    expect(other).to be_valid
  end

  describe "ignored/not_ignored scopes" do
    it "splits gear by whether ignored_at is set" do
      user = create(:user)
      ignored = create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: Time.current)
      not_ignored = create(:strava_gear, user: user, strava_gear_id: "g2", ignored_at: nil)

      expect(described_class.ignored).to contain_exactly(ignored)
      expect(described_class.not_ignored).to contain_exactly(not_ignored)
    end
  end

  describe "#not_ignored_while_mapped validation" do
    it "is invalid when ignored_at is set and a bike already has this strava_gear_id" do
      user = create(:user)
      create(:bike, user: user, strava_gear_id: "g1")
      gear = build(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: Time.current)

      expect(gear).not_to be_valid
      expect(gear.errors[:ignored_at]).to be_present
    end

    it "is valid to set ignored_at when no bike has this strava_gear_id" do
      user = create(:user)
      gear = build(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: Time.current)

      expect(gear).to be_valid
    end

    it "is valid to clear ignored_at even while mapped" do
      user = create(:user)
      create(:bike, user: user, strava_gear_id: "g1")
      gear = build(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: nil)

      expect(gear).to be_valid
    end
  end

  describe ".unmapped_for" do
    it "excludes gear already mapped to one of the user's bikes" do
      user = create(:user)
      mapped = create(:strava_gear, user: user, strava_gear_id: "g1")
      unmapped = create(:strava_gear, user: user, strava_gear_id: "g2")
      create(:bike, user: user, strava_gear_id: "g1")

      expect(described_class.unmapped_for(user)).to contain_exactly(unmapped)
      expect(described_class.unmapped_for(user)).not_to include(mapped)
    end

    it "never includes another user's gear" do
      user = create(:user)
      create(:strava_gear) # another user's

      expect(described_class.unmapped_for(user)).to be_empty
    end

    it "excludes ignored gear that hasn't resurfaced" do
      user = create(:user)
      create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: Time.current)

      expect(described_class.unmapped_for(user)).to be_empty
    end

    it "includes ignored gear that has a new activity since it was ignored (resurfaced)" do
      user = create(:user)
      bike = create(:bike, user: user)
      gear = create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: 10.days.ago)
      create(:strava_activity, user: user, bike: bike, gear_id: "g1", moved_at: 1.day.ago)

      expect(described_class.unmapped_for(user)).to contain_exactly(gear)
    end

    it "excludes ignored gear whose only activity predates ignored_at" do
      user = create(:user)
      bike = create(:bike, user: user)
      create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: 1.day.ago)
      create(:strava_activity, user: user, bike: bike, gear_id: "g1", moved_at: 10.days.ago)

      expect(described_class.unmapped_for(user)).to be_empty
    end
  end

  describe ".ignored_for" do
    it "includes ignored gear that hasn't resurfaced" do
      user = create(:user)
      gear = create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: Time.current)

      expect(described_class.ignored_for(user)).to contain_exactly(gear)
    end

    it "excludes resurfaced gear" do
      user = create(:user)
      bike = create(:bike, user: user)
      create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: 10.days.ago)
      create(:strava_activity, user: user, bike: bike, gear_id: "g1", moved_at: 1.day.ago)

      expect(described_class.ignored_for(user)).to be_empty
    end

    it "excludes not-ignored gear" do
      user = create(:user)
      create(:strava_gear, user: user, strava_gear_id: "g1", ignored_at: nil)

      expect(described_class.ignored_for(user)).to be_empty
    end

    it "never includes another user's gear" do
      user = create(:user)
      create(:strava_gear, ignored_at: Time.current) # another user's

      expect(described_class.ignored_for(user)).to be_empty
    end
  end
end
