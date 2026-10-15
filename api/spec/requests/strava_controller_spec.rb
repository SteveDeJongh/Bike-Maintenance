require "rails_helper"

RSpec.describe "Strava", type: :request do
  # current_user resolves to User.first! — created first in each example so
  # it reliably has the lowest id, ahead of any other user a factory call
  # might incidentally create.
  let!(:current_user) { create(:user) }

  describe "GET /strava/status" do
    it "reports disconnected when there is no credential" do
      get "/strava/status"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq("connected" => false, "athlete_id" => nil)
    end

    it "reports connected with the athlete_id when a credential exists" do
      create(:strava_credential, user: current_user, athlete_id: 555)

      get "/strava/status"

      expect(JSON.parse(response.body)).to eq("connected" => true, "athlete_id" => 555)
    end
  end

  describe "POST /strava/sync" do
    it "enqueues a sync job for the current user" do
      expect { post "/strava/sync" }.to have_enqueued_job(StravaSyncJob).with(current_user.id)
      expect(response).to have_http_status(:accepted)
    end
  end

  describe "GET /strava/unmapped_gear" do
    it "lists cached gear with no mapped bike, scoped to the current user, with enriched details" do
      bike = create(:bike, user: current_user, strava_gear_id: "g2")
      create(:strava_gear, user: current_user, strava_gear_id: "g1",
        name: "Gravel Bike", brand_name: "Specialized", model: "Diverge", retired: true,
        distance_meters: 1000)
      create(:strava_gear, user: current_user, strava_gear_id: "g2") # already mapped to a bike
      create(:strava_gear, strava_gear_id: "g3") # another user's gear

      get "/strava/unmapped_gear"

      expect(JSON.parse(response.body)).to eq(
        [{ "gear_id" => "g1", "name" => "Gravel Bike", "brand_name" => "Specialized",
           "model_name" => "Diverge", "retired" => true, "activity_count" => 0,
           "distance_meters" => 1000 }],
      )
    end

    it "sorts retired gear to the bottom, and ascending by activity count within each group" do
      bike_for_count = create(:bike, user: current_user)
      create(:strava_gear, user: current_user, strava_gear_id: "active-many", retired: false)
      create(:strava_gear, user: current_user, strava_gear_id: "active-zero", retired: false)
      create(:strava_gear, user: current_user, strava_gear_id: "retired-zero", retired: true)
      create(:strava_gear, user: current_user, strava_gear_id: "retired-many", retired: true)
      create_list(:strava_activity, 3, user: current_user, bike: bike_for_count, gear_id: "active-many")
      create_list(:strava_activity, 2, user: current_user, bike: bike_for_count, gear_id: "retired-many")

      get "/strava/unmapped_gear"

      gear_ids = JSON.parse(response.body).map { |g| g["gear_id"] }
      expect(gear_ids).to eq(%w[active-zero active-many retired-zero retired-many])
    end
  end

  describe "POST /strava/refresh_gear" do
    it "runs a gear sync for the current user" do
      create(:strava_credential, user: current_user)
      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:fetch_athlete).and_return("bikes" => [{ "id" => "g1" }])
      allow(client).to receive(:fetch_gear).and_return("name" => "Synced Bike")

      post "/strava/refresh_gear"

      expect(response).to have_http_status(:no_content)
      expect(StravaGear.find_by(user: current_user, strava_gear_id: "g1").name).to eq("Synced Bike")
    end
  end

  describe "GET /strava/callback" do
    it "redirects to the frontend with an error when Strava reports one" do
      get "/strava/callback", params: { error: "access_denied" }

      expect(response).to redirect_to("http://localhost:5173/strava?error=access_denied")
    end

    it "stores the credential and redirects to the frontend on success" do
      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:exchange_code).with("auth-code").and_return(
        "access_token" => "at",
        "refresh_token" => "rt",
        "expires_at" => 6.hours.from_now.to_i,
        "athlete" => { "id" => 999 },
      )

      get "/strava/callback", params: { code: "auth-code", scope: "activity:read_all" }

      expect(response).to redirect_to("http://localhost:5173/strava?connected=1")
      credential = current_user.reload.strava_credential
      expect(credential.access_token).to eq("at")
      expect(credential.athlete_id).to eq(999)
    end

    it "redirects to the frontend with exchange_failed when the token exchange errors" do
      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:exchange_code).and_raise(Strava::Client::Error)

      get "/strava/callback", params: { code: "bad-code" }

      expect(response).to redirect_to("http://localhost:5173/strava?error=exchange_failed")
    end
  end
end
