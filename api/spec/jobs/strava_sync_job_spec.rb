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

  it "does not silently reassign another user's activity to the same strava_id" do
    other_user = create(:user)
    create(:strava_activity, user: other_user, strava_id: 1)

    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([ride(id: 1)])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 2, per_page: 100)
      .and_return([])

    expect { StravaSyncJob.perform_now(user.id) }.to raise_error(ActiveRecord::RecordInvalid)
    expect(StravaActivity.find_by(strava_id: 1).user_id).to eq(other_user.id)
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

  it "preserves ignored_at on a ride that stays unattributed through a sync" do
    activity = create(:strava_activity, user: user, bike_id: nil, gear_id: nil, strava_id: 1, ignored_at: Time.current)

    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: anything, page: 1, per_page: 100)
      .and_return([ride(id: 1, gear_id: nil)])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: anything, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    expect(activity.reload.ignored_at).to be_present
  end

  it "clears ignored_at when a sync newly attributes a previously-ignored ride" do
    bike = create(:bike, user: user, strava_gear_id: "g1")
    activity = create(:strava_activity, user: user, bike_id: nil, gear_id: nil, strava_id: 1, ignored_at: Time.current)

    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: anything, page: 1, per_page: 100)
      .and_return([ride(id: 1, gear_id: "g1")])
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: anything, page: 2, per_page: 100)
      .and_return([])

    StravaSyncJob.perform_now(user.id)

    activity.reload
    expect(activity.bike_id).to eq(bike.id)
    expect(activity.ignored_at).to be_nil
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

  it "records last_synced_at on the credential after a successful sync, even with no new activities" do
    allow(client).to receive(:fetch_activities)
      .with(access_token: anything, after: nil, page: 1, per_page: 100)
      .and_return([])

    expect { StravaSyncJob.perform_now(user.id) }.to change { credential.reload.last_synced_at }.from(nil)
  end

  describe "full refresh" do
    it "re-attributes a ride whose gear changed, via the same upsert_activity path" do
      bike_a = create(:bike, user: user, strava_gear_id: "a")
      bike_b = create(:bike, user: user, strava_gear_id: "b")
      activity = create(:strava_activity, user: user, bike: bike_a, gear_id: "a", strava_id: 1)

      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([ride(id: 1, gear_id: "b")])
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 2, per_page: 100)
        .and_return([])

      StravaSyncJob.perform_now(user.id, full_resync: true)

      expect(activity.reload.bike_id).to eq(bike_b.id)
    end

    it "deletes a local ride missing from a complete listing, including one whose type changed to Run" do
      deleted_ride = create(:strava_activity, user: user, bike_id: nil, strava_id: 1)
      type_changed_ride = create(:strava_activity, user: user, bike_id: nil, strava_id: 2)
      kept_ride = create(:strava_activity, user: user, bike_id: nil, strava_id: 3)

      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([ride(id: 2, type: "Run"), ride(id: 3, type: "Ride")])
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 2, per_page: 100)
        .and_return([])

      StravaSyncJob.perform_now(user.id, full_resync: true)

      expect(StravaActivity.exists?(deleted_ride.id)).to be false
      expect(StravaActivity.exists?(type_changed_ride.id)).to be false
      expect(StravaActivity.exists?(kept_ride.id)).to be true
    end

    it "does not delete anything when the listing hits the page cap instead of ending naturally" do
      stub_const("StravaSyncJob::FULL_SYNC_MAX_PAGES", 2)
      kept_ride = create(:strava_activity, user: user, bike_id: nil, strava_id: 999)

      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([ride(id: 1)])
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 2, per_page: 100)
        .and_return([ride(id: 2)]) # never empty -- hits the page cap, not a natural end

      StravaSyncJob.perform_now(user.id, full_resync: true)

      expect(StravaActivity.exists?(kept_ride.id)).to be true
    end

    it "does not delete anything when an error occurs mid-listing" do
      kept_ride = create(:strava_activity, user: user, bike_id: nil, strava_id: 999)

      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([ride(id: 1)])
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 2, per_page: 100)
        .and_raise(Strava::Client::Error, "rate limited")

      expect { StravaSyncJob.perform_now(user.id, full_resync: true) }.to raise_error(Strava::Client::Error)

      expect(StravaActivity.exists?(kept_ride.id)).to be true
      expect(credential.reload.last_full_sync_at).to be_nil
    end

    it "does not delete anything when the listing is empty but local rides exist (treated as suspect)" do
      kept_ride = create(:strava_activity, user: user, bike_id: nil, strava_id: 999)

      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([])

      expect(Rails.logger).to receive(:warn).with(/suspect/)
      StravaSyncJob.perform_now(user.id, full_resync: true)

      expect(StravaActivity.exists?(kept_ride.id)).to be true
    end

    it "sets last_full_sync_at only on a successful full refresh" do
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([])

      expect { StravaSyncJob.perform_now(user.id, full_resync: true) }
        .to change { credential.reload.last_full_sync_at }.from(nil)
    end

    it "never sets last_full_sync_at on a plain incremental sync" do
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([])

      StravaSyncJob.perform_now(user.id)

      expect(credential.reload.last_full_sync_at).to be_nil
    end

    it "clears full_sync_started_at when the job completes" do
      credential.update!(full_sync_started_at: Time.current)
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([])

      StravaSyncJob.perform_now(user.id, full_resync: true)

      expect(credential.reload.full_sync_started_at).to be_nil
    end

    it "clears full_sync_started_at even when the job raises" do
      credential.update!(full_sync_started_at: Time.current)
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_raise(Strava::Client::Error, "boom")

      expect { StravaSyncJob.perform_now(user.id, full_resync: true) }.to raise_error(Strava::Client::Error)

      expect(credential.reload.full_sync_started_at).to be_nil
    end
  end

  describe "failure recording" do
    def fail_paging_with(error)
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_raise(error)
    end

    it "records rate_limited and the retry_at, and re-raises" do
      error = Strava::Client::RateLimitedError.new(
        "rate limited", read_limit: nil, read_usage: nil, overall_limit: nil, overall_usage: nil,
        retry_at: Time.zone.local(2026, 11, 10, 13, 0),
      )
      fail_paging_with(error)

      expect { StravaSyncJob.perform_now(user.id) }.to raise_error(Strava::Client::RateLimitedError)

      credential.reload
      expect(credential.last_sync_error).to eq("rate_limited")
      expect(credential.last_sync_failed_kind).to eq("incremental")
      expect(credential.last_sync_failed_at).to be_present
      expect(credential.last_sync_retry_at).to eq(Time.zone.local(2026, 11, 10, 13, 0))
    end

    it "records auth_failed for a token refresh rejection" do
      credential.update!(expires_at: 1.minute.ago) # forces ensure_fresh_access_token! to actually refresh
      allow(client).to receive(:refresh_access_token).and_raise(Strava::Client::AuthenticationError, "revoked")

      expect { StravaSyncJob.perform_now(user.id) }.to raise_error(Strava::Client::AuthenticationError)

      expect(credential.reload.last_sync_error).to eq("auth_failed")
      expect(credential.reload.last_sync_retry_at).to be_nil
    end

    it "records strava_unavailable for a generic client error" do
      fail_paging_with(Strava::Client::Error.new("Strava 500"))

      expect { StravaSyncJob.perform_now(user.id) }.to raise_error(Strava::Client::Error)

      expect(credential.reload.last_sync_error).to eq("strava_unavailable")
    end

    it "records strava_unavailable for a network timeout" do
      fail_paging_with(Faraday::TimeoutError.new("timed out"))

      expect { StravaSyncJob.perform_now(user.id) }.to raise_error(Faraday::TimeoutError)

      expect(credential.reload.last_sync_error).to eq("strava_unavailable")
    end

    it "records unknown for anything else" do
      fail_paging_with(RuntimeError.new("something else entirely"))

      expect { StravaSyncJob.perform_now(user.id) }.to raise_error(RuntimeError)

      expect(credential.reload.last_sync_error).to eq("unknown")
    end

    it "records last_sync_failed_kind as full for a failed full refresh" do
      fail_paging_with(Strava::Client::Error.new("boom"))

      expect { StravaSyncJob.perform_now(user.id, full_resync: true) }.to raise_error(Strava::Client::Error)

      expect(credential.reload.last_sync_failed_kind).to eq("full")
    end

    it "a failed full refresh never sets last_full_sync_at, so it doesn't start the cooldown" do
      fail_paging_with(Strava::Client::Error.new("boom"))

      expect { StravaSyncJob.perform_now(user.id, full_resync: true) }.to raise_error(Strava::Client::Error)

      credential.reload
      expect(credential.last_full_sync_at).to be_nil
      expect(credential.full_sync_available_at).to be_nil
    end

    it "clears every failure column on the next successful run" do
      credential.update!(
        last_sync_failed_at: 1.hour.ago, last_sync_error: "rate_limited",
        last_sync_failed_kind: "incremental", last_sync_retry_at: 1.hour.ago,
      )
      allow(client).to receive(:fetch_activities)
        .with(access_token: anything, after: nil, page: 1, per_page: 100)
        .and_return([])

      StravaSyncJob.perform_now(user.id)

      credential.reload
      expect(credential.last_sync_failed_at).to be_nil
      expect(credential.last_sync_error).to be_nil
      expect(credential.last_sync_failed_kind).to be_nil
      expect(credential.last_sync_retry_at).to be_nil
    end
  end
end
