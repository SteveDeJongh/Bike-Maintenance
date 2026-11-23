require "rails_helper"

RSpec.describe StravaWebhookEventJob, type: :job do
  include ActiveJob::TestHelper

  let(:user) { create(:user) }
  let!(:credential) { create(:strava_credential, user: user, athlete_id: 555, expires_at: 1.hour.from_now) }
  let!(:bike) { create(:bike, user: user, strava_gear_id: "g1") }
  let(:client) { instance_double(Strava::Client) }

  def event(object_type: "activity", aspect_type: "create", object_id: 42, owner_id: 555, updates: {})
    {
      "object_type" => object_type, "aspect_type" => aspect_type, "object_id" => object_id,
      "owner_id" => owner_id, "subscription_id" => 1, "event_time" => 1_780_000_000, "updates" => updates,
    }
  end

  def raw(name: "Lunch Ride", type: "Ride", gear_id: "g1")
    {
      "id" => 42, "name" => name, "distance" => 30_000, "type" => type, "sport_type" => type,
      "start_date" => "2026-11-20T18:00:00Z", "gear_id" => gear_id,
    }
  end

  before do
    allow(Strava::Client).to receive(:new).and_return(client)
    create(:strava_gear, user: user, strava_gear_id: "g1")
  end

  it "creates an unknown ride and attributes it to the mapped bike" do
    allow(client).to receive(:fetch_activity).with(42, access_token: "access-token").and_return(raw)

    described_class.perform_now(event)

    ride = user.strava_activities.find_by!(strava_id: 42)
    expect(ride.bike_id).to eq(bike.id)
    expect(ride.name).to eq("Lunch Ride")
  end

  context "with the ride already stored" do
    let!(:ride) { create(:strava_activity, user: user, bike: bike, strava_id: 42, name: "Old name") }

    it "re-fetches on update and applies the changes" do
      allow(client).to receive(:fetch_activity).and_return(raw(name: "New name"))

      described_class.perform_now(event(aspect_type: "update", updates: { "title" => "New name" }))

      expect(ride.reload.name).to eq("New name")
    end

    it "deletes the ride when an update makes it an excluded type" do
      allow(client).to receive(:fetch_activity).and_return(raw(type: "Run"))

      described_class.perform_now(event(aspect_type: "update", updates: { "type" => "Run" }))

      expect(StravaActivity.exists?(ride.id)).to be(false)
    end

    it "deletes the ride when the fetch 404s" do
      allow(client).to receive(:fetch_activity).and_raise(Strava::Client::NotFoundError)

      described_class.perform_now(event(aspect_type: "update"))

      expect(StravaActivity.exists?(ride.id)).to be(false)
    end

    it "removes the row on a delete event without calling Strava" do
      expect(client).not_to receive(:fetch_activity)

      described_class.perform_now(event(aspect_type: "delete"))

      expect(StravaActivity.exists?(ride.id)).to be(false)
    end

    it "is harmless when the same event is processed twice" do
      allow(client).to receive(:fetch_activity).and_return(raw(name: "New name"))

      2.times { described_class.perform_now(event(aspect_type: "update")) }

      expect(user.strava_activities.where(strava_id: 42).pluck(:name)).to eq([ "New name" ])
    end

    it "destroys the credential on deauthorization and keeps the rides" do
      described_class.perform_now(event(object_type: "athlete", aspect_type: "update", object_id: 555,
        updates: { "authorized" => "false" }))

      expect(StravaCredential.exists?(credential.id)).to be(false)
      expect(StravaActivity.exists?(ride.id)).to be(true)
      expect(StravaGear.where(user: user)).to exist
    end
  end

  it "ignores an athlete update that isn't a deauthorization" do
    described_class.perform_now(event(object_type: "athlete", aspect_type: "update", updates: { "name" => "x" }))

    expect(StravaCredential.exists?(credential.id)).to be(true)
  end

  it "does nothing for an unknown owner_id" do
    expect(client).not_to receive(:fetch_activity)

    described_class.perform_now(event(owner_id: 999))

    expect(StravaActivity.count).to eq(0)
  end

  it "leaves the sync-run columns alone" do
    credential.update!(last_synced_at: 2.days.ago, sync_started_at: nil)
    allow(client).to receive(:fetch_activity).and_return(raw)

    expect { described_class.perform_now(event) }
      .not_to(change { credential.reload.attributes.slice("last_synced_at", "sync_started_at", "last_sync_failed_at") })
  end

  it "re-enqueues a rate-limited fetch for when Strava's window resets" do
    retry_at = 10.minutes.from_now.change(usec: 0)
    allow(client).to receive(:fetch_activity).and_raise(
      Strava::Client::RateLimitedError.new("limited", read_limit: nil, read_usage: nil, overall_limit: nil,
        overall_usage: nil, retry_at: retry_at),
    )

    described_class.perform_now(event)

    expect(described_class).to have_been_enqueued.with(event).at(retry_at)
    expect(credential.reload.last_sync_failed_at).to be_nil
  end

  it "retries a transient Strava error" do
    allow(client).to receive(:fetch_activity).and_raise(Strava::Client::Error, "Strava request failed: 503")

    described_class.perform_now(event)

    expect(described_class).to have_been_enqueued.with(event)
  end

  it "discards the event when the refresh token was revoked" do
    credential.update!(expires_at: 1.minute.ago)
    allow(client).to receive(:refresh_access_token).and_raise(Strava::Client::AuthenticationError)

    described_class.perform_now(event)

    expect(described_class).not_to have_been_enqueued
    expect(StravaActivity.count).to eq(0)
  end
end
