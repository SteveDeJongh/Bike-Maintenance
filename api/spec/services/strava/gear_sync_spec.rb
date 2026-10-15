require "rails_helper"

RSpec.describe Strava::GearSync do
  let(:user) { create(:user) }
  let(:credential) { create(:strava_credential, user: user, expires_at: 1.hour.from_now) }
  let(:client) { instance_double(Strava::Client) }

  before do
    credential
    allow(Strava::Client).to receive(:new).and_return(client)
  end

  it "unions athlete-sourced and activity-sourced gear ids" do
    bike = create(:bike, user: user)
    create(:strava_activity, user: user, bike: bike, gear_id: "from-activity")

    allow(client).to receive(:fetch_athlete).and_return("bikes" => [{ "id" => "from-athlete" }])
    allow(client).to receive(:fetch_gear).and_return("name" => "A Bike", "retired" => false)

    Strava::GearSync.new(user).call

    expect(StravaGear.where(user: user).pluck(:strava_gear_id)).to contain_exactly("from-activity", "from-athlete")
  end

  it "works off activity-sourced ids alone when the credential predates profile:read_all" do
    bike = create(:bike, user: user)
    create(:strava_activity, user: user, bike: bike, gear_id: "from-activity")

    allow(client).to receive(:fetch_athlete).and_return({}) # no "bikes" key at all
    allow(client).to receive(:fetch_gear).and_return("name" => "A Bike")

    Strava::GearSync.new(user).call

    expect(StravaGear.where(user: user).pluck(:strava_gear_id)).to eq(["from-activity"])
  end

  it "skips a gear id whose detail fetch fails, without aborting the rest" do
    bike = create(:bike, user: user)
    create(:strava_activity, user: user, bike: bike, gear_id: "bad-id")
    create(:strava_activity, user: user, bike: bike, gear_id: "good-id")

    allow(client).to receive(:fetch_athlete).and_return({})
    allow(client).to receive(:fetch_gear).with("bad-id", access_token: anything).and_raise(Strava::Client::Error)
    allow(client).to receive(:fetch_gear).with("good-id", access_token: anything).and_return("name" => "Good Bike")

    Strava::GearSync.new(user).call

    expect(StravaGear.where(user: user).pluck(:strava_gear_id)).to eq(["good-id"])
  end

  it "upserts rather than duplicates on repeat ids" do
    bike = create(:bike, user: user)
    create(:strava_activity, user: user, bike: bike, gear_id: "g1")

    allow(client).to receive(:fetch_athlete).and_return({})
    allow(client).to receive(:fetch_gear).and_return("name" => "First name", "retired" => false)
    Strava::GearSync.new(user).call

    allow(client).to receive(:fetch_gear).and_return("name" => "Updated name", "retired" => true)
    Strava::GearSync.new(user).call

    expect(StravaGear.where(user: user, strava_gear_id: "g1").count).to eq(1)
    gear = StravaGear.find_by(user: user, strava_gear_id: "g1")
    expect(gear.name).to eq("Updated name")
    expect(gear.retired).to be true
  end
end
