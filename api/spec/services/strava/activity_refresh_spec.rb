require "rails_helper"

RSpec.describe Strava::ActivityRefresh do
  let(:user) { create(:user) }
  let!(:credential) { create(:strava_credential, user: user, expires_at: 1.hour.from_now) }
  let(:client) { instance_double(Strava::Client) }
  let(:bike) { create(:bike, user: user, strava_gear_id: "g1") }

  def raw(id: 42, name: "Morning Ride", type: "Ride", gear_id: "g1")
    {
      "id" => id, "name" => name, "distance" => 20_000, "type" => type, "sport_type" => type,
      "start_date" => "2026-06-01T09:00:00Z", "gear_id" => gear_id,
    }
  end

  def refresh(strava_id: 42, **options)
    described_class.call(user: user, strava_id: strava_id, access_token: "tok", client: client, **options)
  end

  before do
    bike
    allow(Strava::Client).to receive(:new).and_return(client)
    create(:strava_gear, user: user, strava_gear_id: "g1")
  end

  context "with no stored row" do
    it "creates the ride, attributed to the bike mapped to its gear" do
      allow(client).to receive(:fetch_activity).with(42, access_token: "tok").and_return(raw)

      result = refresh

      expect(result.status).to eq(:kept)
      expect(result.activity).to be_persisted
      expect(result.activity.bike_id).to eq(bike.id)
      expect(user.strava_activities.pluck(:strava_id)).to eq([ 42 ])
    end

    it "stores nothing for an excluded type" do
      allow(client).to receive(:fetch_activity).and_return(raw(type: "Run"))

      expect(refresh.status).to eq(:skipped)
      expect(StravaActivity.count).to eq(0)
    end

    it "stores nothing on a 404" do
      allow(client).to receive(:fetch_activity).and_raise(Strava::Client::NotFoundError)

      expect(refresh.status).to eq(:skipped)
      expect(StravaActivity.count).to eq(0)
    end

    it "upserts onto a row a concurrent refresh created first" do
      allow(client).to receive(:fetch_activity).and_return(raw(name: "Renamed"))
      allow(Strava::ActivityUpsert).to receive(:call).and_wrap_original do |original, **args|
        # The competing job inserts the same strava_id between our lookup and our write.
        if args[:activity].new_record? && !StravaActivity.exists?(strava_id: 42)
          create(:strava_activity, user: user, bike: bike, strava_id: 42, name: "First")
        end
        original.call(**args)
      end

      result = refresh

      expect(result.status).to eq(:kept)
      expect(StravaActivity.where(strava_id: 42).pluck(:name)).to eq([ "Renamed" ])
      expect(result.activity.name).to eq("Renamed")
    end
  end

  context "with a stored row" do
    let!(:ride) { create(:strava_activity, user: user, bike: bike, strava_id: 42, name: "Old name") }

    it "applies Strava's current values" do
      allow(client).to receive(:fetch_activity).and_return(raw(name: "New name"))

      result = refresh

      expect(result.status).to eq(:kept)
      expect(ride.reload.name).to eq("New name")
    end

    it "deletes the ride when its type is now excluded" do
      allow(client).to receive(:fetch_activity).and_return(raw(type: "Run"))

      expect(refresh.status).to eq(:deleted)
      expect(StravaActivity.exists?(ride.id)).to be(false)
    end

    it "deletes the ride on a 404" do
      allow(client).to receive(:fetch_activity).and_raise(Strava::Client::NotFoundError)

      expect(refresh.status).to eq(:deleted)
      expect(StravaActivity.exists?(ride.id)).to be(false)
    end

    it "lets any other Strava error propagate" do
      allow(client).to receive(:fetch_activity).and_raise(Strava::Client::Error)

      expect { refresh }.to raise_error(Strava::Client::Error)
      expect(ride.reload.name).to eq("Old name")
    end
  end

  describe "gear backfill" do
    it "fetches a gear id the cache doesn't have yet" do
      allow(client).to receive(:fetch_activity).and_return(raw(gear_id: "g2"))
      allow(client).to receive(:fetch_gear).with("g2", access_token: anything).and_return("name" => "New bike")

      refresh

      expect(StravaGear.find_by(user: user, strava_gear_id: "g2").name).to eq("New bike")
    end

    it "skips the fetch with backfill_gear: false" do
      allow(client).to receive(:fetch_activity).and_return(raw(gear_id: "g2"))
      expect(client).not_to receive(:fetch_gear)

      refresh(backfill_gear: false)
    end
  end
end
