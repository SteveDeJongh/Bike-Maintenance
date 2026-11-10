require "rails_helper"

RSpec.describe Strava::ActivityUpsert do
  let(:user) { create(:user) }

  def raw(gear_id: nil, type: "Ride", distance: 10_000)
    {
      "name" => "Morning Ride", "distance" => distance, "type" => type, "sport_type" => "Ride",
      "start_date" => "2026-06-01T09:00:00Z", "gear_id" => gear_id, "trainer" => false, "commute" => false,
    }
  end

  it "builds a new activity attributed to the given bike" do
    bike = create(:bike, user: user, strava_gear_id: "g1")
    activity = user.strava_activities.build(strava_id: 42)

    Strava::ActivityUpsert.call(user: user, activity: activity, raw: raw(gear_id: "g1"), bike: bike)

    expect(activity).to be_persisted
    expect(activity.bike_id).to eq(bike.id)
    expect(activity.gear_id).to eq("g1")
    expect(activity.name).to eq("Morning Ride")
  end

  it "leaves ignored_at untouched when the ride stays unattributed" do
    activity = create(:strava_activity, user: user, bike_id: nil, gear_id: nil, ignored_at: Time.current)

    Strava::ActivityUpsert.call(user: user, activity: activity, raw: raw, bike: nil)

    activity.reload
    expect(activity.bike_id).to be_nil
    expect(activity.ignored_at).to be_present
  end

  it "clears ignored_at when the ride becomes attributed" do
    activity = create(:strava_activity, user: user, bike_id: nil, gear_id: nil, ignored_at: Time.current)
    bike = create(:bike, user: user, strava_gear_id: "g1")

    Strava::ActivityUpsert.call(user: user, activity: activity, raw: raw(gear_id: "g1"), bike: bike)

    activity.reload
    expect(activity.bike_id).to eq(bike.id)
    expect(activity.ignored_at).to be_nil
  end
end
