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
end
