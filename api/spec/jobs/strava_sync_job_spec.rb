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
  end

  it "does nothing when the user has no credential" do
    other_user = create(:user)

    expect(Strava::Client).not_to receive(:new)
    StravaSyncJob.perform_now(other_user.id)
  end

  it "stores only Ride-type activities" do
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([ride(id: 1, type: "Ride"), ride(id: 2, type: "Run")])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    expect(StravaActivity.pluck(:strava_id)).to eq([1])
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
end
