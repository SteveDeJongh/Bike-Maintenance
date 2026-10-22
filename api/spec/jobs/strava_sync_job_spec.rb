require "rails_helper"

RSpec.describe StravaSyncJob, type: :job do
  def ride(id:, distance: 10_000, gear_id: nil, type: "Ride", start_date: "2026-06-01T09:00:00Z")
    {
      "id" => id,
      "name" => "Ride #{id}",
      "distance" => distance,
      "type" => type,
      "sport_type" => "Ride",
      "start_date" => start_date,
      "gear_id" => gear_id,
    }
  end

  let(:user) { create(:user) }
  let(:credential) { create(:strava_credential, user: user, expires_at: 1.hour.from_now) }
  let(:client) { instance_double(Strava::Client) }

  before do
    credential
    allow(Strava::Client).to receive(:new).and_return(client)
    # StravaSyncJob also runs Strava::GearSync after paging activities; give
    # it harmless defaults so tests that don't care about gear details don't
    # need to stub these individually.
    allow(client).to receive(:fetch_athlete).and_return({})
    allow(client).to receive(:fetch_gear).and_return({})
  end

  it "does nothing when the user has no credential" do
    other_user = create(:user)

    expect(Strava::Client).not_to receive(:new)
    StravaSyncJob.perform_now(other_user.id)
  end

  it "stores Ride and VirtualRide activities, excluding other types" do
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([ride(id: 1, type: "Ride"), ride(id: 2, type: "VirtualRide"), ride(id: 3, type: "Run")])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    expect(StravaActivity.pluck(:strava_id)).to contain_exactly(1, 2)
  end

  it "upserts rather than duplicates on a repeat strava_id" do
    # after changes between the two syncs below (it's derived from the max
    # stored moved_at), so this stub deliberately doesn't pin it down.
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: anything, page: 1, per_page: 100)
      .and_return([ride(id: 1, distance: 5_000)])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: anything, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)
    StravaSyncJob.perform_now(user.id)

    expect(StravaActivity.where(strava_id: 1).count).to eq(1)
    expect(StravaActivity.find_by(strava_id: 1).distance_meters).to eq(5_000)
  end

  it "resolves bike_id only against the syncing user's own bikes" do
    bike = create(:bike, user: user, strava_gear_id: "g1")
    other_users_bike = create(:bike, strava_gear_id: "g1")

    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([ride(id: 1, gear_id: "g1")])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    activity = StravaActivity.find_by(strava_id: 1)
    expect(activity.bike_id).to eq(bike.id)
    expect(activity.bike_id).not_to eq(other_users_bike.id)
  end

  it "stops paginating once a page comes back empty" do
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([ride(id: 1)])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    expect(client).to have_received(:fetch_activities).twice
  end

  it "uses the latest stored moved_at as the after cursor for incremental sync" do
    create(:strava_activity, user: user, bike: create(:bike, user: user),
      moved_at: Time.zone.local(2026, 5, 1, 9, 0))

    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: Time.zone.local(2026, 5, 1, 9, 0).to_i, page: 1, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    expect(client).to have_received(:fetch_activities).once
  end

  it "ignores the stored cursor and fetches from the beginning when full_resync is true" do
    create(:strava_activity, user: user, bike: create(:bike, user: user),
      moved_at: Time.zone.local(2026, 5, 1, 9, 0))

    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id, full_resync: true)

    expect(client).to have_received(:fetch_activities).with(access_token: anything, after: nil, page: 1, per_page: 100)
  end

  it "stores the analytics fields present on the raw activity, and nil for fields Strava omits" do
    ride_with_power = ride(id: 1).merge(
      "trainer" => true, "commute" => true, "moving_time" => 3600, "elapsed_time" => 3700,
      "average_speed" => 5.5, "max_speed" => 12.1, "total_elevation_gain" => 250.0,
      "average_watts" => 180.5, "weighted_average_watts" => 190, "device_watts" => true,
      "kilojoules" => 650.0, "average_heartrate" => 140.0, "max_heartrate" => 170.0,
      "average_cadence" => 85.0,
    )
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([ride_with_power])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    activity = StravaActivity.find_by(strava_id: 1)
    expect(activity.trainer).to be true
    expect(activity.commute).to be true
    expect(activity.moving_time).to eq(3600)
    expect(activity.average_watts).to eq(180.5)
    expect(activity.device_watts).to be true
    expect(activity.average_heartrate).to eq(140.0)
  end

  it "stores nil for analytics fields absent from the raw activity (no power meter/HR monitor)" do
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([ride(id: 1)])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    activity = StravaActivity.find_by(strava_id: 1)
    expect(activity.average_watts).to be_nil
    expect(activity.average_heartrate).to be_nil
    expect(activity.trainer).to be false
    expect(activity.commute).to be false
  end

  it "also runs a gear sync after paging activities" do
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([ride(id: 1, gear_id: "g1")])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 2, per_page: 100)
      .and_return([])
    allow(client).to receive(:fetch_gear).with("g1", access_token: anything)
      .and_return("name" => "My Gravel Bike", "retired" => false)

    StravaSyncJob.perform_now(user.id)

    gear = StravaGear.find_by(user: user, strava_gear_id: "g1")
    expect(gear).to be_present
    expect(gear.name).to eq("My Gravel Bike")
  end
end
