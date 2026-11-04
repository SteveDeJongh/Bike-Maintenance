require "rails_helper"

RSpec.describe "Strava", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /strava/status" do
    it "reports disconnected when there is no credential" do
      get "/strava/status"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq("connected" => false, "athlete_id" => nil, "last_synced_at" => nil)
    end

    it "reports connected with the athlete_id when a credential exists" do
      create(:strava_credential, user: current_user, athlete_id: 555)

      get "/strava/status"

      body = JSON.parse(response.body)
      expect(body["connected"]).to be true
      expect(body["athlete_id"]).to eq(555)
    end

    it "reports last_synced_at when the credential has one" do
      create(:strava_credential, user: current_user, last_synced_at: Time.zone.local(2026, 11, 4, 9, 0))

      get "/strava/status"

      expect(JSON.parse(response.body)["last_synced_at"]).to eq("2026-11-04T09:00:00.000Z")
    end

    it "reports last_synced_at as nil when the credential has never synced" do
      create(:strava_credential, user: current_user, last_synced_at: nil)

      get "/strava/status"

      expect(JSON.parse(response.body)["last_synced_at"]).to be_nil
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

  describe "GET /strava/mapped_gear" do
    it "lists the current user's bikes that have a strava_gear_id, enriched from the cache" do
      bike = create(:bike, user: current_user, name: "Soloist", strava_gear_id: "g1")
      create(:strava_gear, user: current_user, strava_gear_id: "g1",
        name: "Juan solo", brand_name: "C", model: "S", retired: false, distance_meters: 999_999)
      create(:strava_activity, user: current_user, bike: bike, distance_meters: 1_000)
      create(:strava_activity, user: current_user, bike: bike, distance_meters: 2_000)
      create(:bike, user: current_user, strava_gear_id: nil) # unmapped, excluded

      get "/strava/mapped_gear"

      expect(JSON.parse(response.body)).to eq(
        [{ "bike_id" => bike.id, "bike_name" => "Soloist", "gear_id" => "g1",
           "name" => "Juan solo", "brand_name" => "C", "model_name" => "S", "retired" => false,
           "activity_count" => 2, "distance_meters" => 3_000 }],
      )
    end

    it "falls back gracefully when the gear is not in the cache" do
      create(:bike, user: current_user, name: "Manual Bike", strava_gear_id: "uncached")

      get "/strava/mapped_gear"

      expect(JSON.parse(response.body)).to eq(
        [{ "bike_id" => Bike.find_by(name: "Manual Bike").id, "bike_name" => "Manual Bike",
           "gear_id" => "uncached", "name" => nil, "brand_name" => nil, "model_name" => nil,
           "retired" => false, "activity_count" => 0, "distance_meters" => 0 }],
      )
    end

    it "sorts alphabetically by bike name" do
      create(:bike, user: current_user, name: "Zeta", strava_gear_id: "g1")
      create(:bike, user: current_user, name: "Alpha", strava_gear_id: "g2")

      get "/strava/mapped_gear"

      expect(JSON.parse(response.body).map { |b| b["bike_name"] }).to eq(%w[Alpha Zeta])
    end

    it "is scoped to the current user" do
      create(:bike, strava_gear_id: "other-users-gear")

      get "/strava/mapped_gear"

      expect(JSON.parse(response.body)).to eq([])
    end
  end

  describe "PATCH /strava/mapped_gear/:gear_id" do
    it "unlinks the mapping and nullifies the activities' bike_id" do
      bike = create(:bike, user: current_user, strava_gear_id: "g1")
      activity = create(:strava_activity, user: current_user, bike: bike, gear_id: "g1")

      patch "/strava/mapped_gear/g1", params: { bike_id: nil }

      expect(response).to have_http_status(:no_content)
      expect(bike.reload.strava_gear_id).to be_nil
      expect(activity.reload.bike_id).to be_nil
    end

    it "reassigns the mapping and the activities to a different, currently-unmapped bike" do
      old_bike = create(:bike, user: current_user, strava_gear_id: "g1")
      new_bike = create(:bike, user: current_user, strava_gear_id: nil)
      activity = create(:strava_activity, user: current_user, bike: old_bike, gear_id: "g1")

      patch "/strava/mapped_gear/g1", params: { bike_id: new_bike.id }

      expect(response).to have_http_status(:no_content)
      expect(old_bike.reload.strava_gear_id).to be_nil
      expect(new_bike.reload.strava_gear_id).to eq("g1")
      expect(activity.reload.bike_id).to eq(new_bike.id)
    end

    it "rejects a target bike that is already mapped to a different gear" do
      create(:bike, user: current_user, strava_gear_id: "g1")
      other_bike = create(:bike, user: current_user, strava_gear_id: "g2")

      patch "/strava/mapped_gear/g1", params: { bike_id: other_bike.id }

      expect(response).to have_http_status(:unprocessable_content)
      expect(other_bike.reload.strava_gear_id).to eq("g2")
    end

    it "is scoped to the current user" do
      other_bike = create(:bike, strava_gear_id: "g1")

      patch "/strava/mapped_gear/g1", params: { bike_id: nil }

      expect(other_bike.reload.strava_gear_id).to eq("g1")
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
      get "/auth/strava/callback", params: { error: "access_denied" }

      expect(response).to redirect_to("http://localhost:5173/strava?error=access_denied")
    end

    it "stores the credential and redirects to the frontend on success" do
      state = authorize_and_capture_state

      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:exchange_code).with("auth-code").and_return(
        "access_token" => "at",
        "refresh_token" => "rt",
        "expires_at" => 6.hours.from_now.to_i,
        "athlete" => { "id" => 999 },
      )

      get "/auth/strava/callback", params: { code: "auth-code", scope: "activity:read_all", state: state }

      expect(response).to redirect_to("http://localhost:5173/strava?connected=1")
      credential = current_user.reload.strava_credential
      expect(credential.access_token).to eq("at")
      expect(credential.athlete_id).to eq(999)
    end

    it "redirects to the frontend with athlete_already_linked when the athlete is already linked to a different account" do
      create(:strava_credential, athlete_id: 999)
      state = authorize_and_capture_state

      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:exchange_code).with("auth-code").and_return(
        "access_token" => "at",
        "refresh_token" => "rt",
        "expires_at" => 6.hours.from_now.to_i,
        "athlete" => { "id" => 999 },
      )

      get "/auth/strava/callback", params: { code: "auth-code", scope: "activity:read_all", state: state }

      expect(response).to redirect_to("http://localhost:5173/strava?error=athlete_already_linked")
      expect(current_user.reload.strava_credential).to be_nil
    end

    it "redirects to the frontend with exchange_failed when the token exchange errors" do
      state = authorize_and_capture_state

      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:exchange_code).and_raise(Strava::Client::Error)

      get "/auth/strava/callback", params: { code: "bad-code", state: state }

      expect(response).to redirect_to("http://localhost:5173/strava?error=exchange_failed")
    end

    it "redirects to the frontend with invalid_state when the state param doesn't match" do
      authorize_and_capture_state

      get "/auth/strava/callback", params: { code: "auth-code", state: "not-the-real-state" }

      expect(response).to redirect_to("http://localhost:5173/strava?error=invalid_state")
    end

    it "redirects to the frontend with invalid_state when no authorize step happened first" do
      get "/auth/strava/callback", params: { code: "auth-code", state: "anything" }

      expect(response).to redirect_to("http://localhost:5173/strava?error=invalid_state")
    end

    it "refuses to link a Strava athlete already linked to a different account" do
      create(:user_identity, provider: "strava", uid: "333")
      state = authorize_and_capture_state
      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:exchange_code).with("auth-code").and_return(
        "access_token" => "at", "refresh_token" => "rt", "expires_at" => 6.hours.from_now.to_i,
        "athlete" => { "id" => 333 },
      )

      get "/auth/strava/callback", params: { code: "auth-code", state: state }

      expect(response).to redirect_to("http://localhost:5173/strava?error=identity_already_linked")
    end
  end

  describe "GET /auth/strava/callback as a sign-in method (not already signed in)" do
    before { delete "/auth/logout" }

    it "creates a new user, provisions defaults, and signs them in when the athlete has never been seen" do
      state = authorize_and_capture_state
      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:exchange_code).with("auth-code").and_return(
        "access_token" => "at", "refresh_token" => "rt", "expires_at" => 6.hours.from_now.to_i,
        "athlete" => { "id" => 111, "firstname" => "Jamie", "lastname" => "Rivera" },
      )

      expect {
        get "/auth/strava/callback", params: { code: "auth-code", state: state }
      }.to change(User, :count).by(1)

      expect(response).to redirect_to("http://localhost:5173/")
      new_user = User.find_by(name: "Jamie Rivera")
      expect(new_user).to be_present
      expect(new_user.strava_credential.athlete_id).to eq(111)
      expect(new_user.user_identities.find_by(provider: "strava", uid: "111")).to be_present
      expect(new_user.service_types.count).to eq(4)

      get "/me"
      expect(JSON.parse(response.body)["id"]).to eq(new_user.id)
    end

    it "signs in the existing user already linked to that Strava athlete, without creating a new one" do
      identity = create(:user_identity, provider: "strava", uid: "222")
      state = authorize_and_capture_state
      client = instance_double(Strava::Client)
      allow(Strava::Client).to receive(:new).and_return(client)
      allow(client).to receive(:exchange_code).with("auth-code").and_return(
        "access_token" => "at", "refresh_token" => "rt", "expires_at" => 6.hours.from_now.to_i,
        "athlete" => { "id" => 222 },
      )

      expect {
        get "/auth/strava/callback", params: { code: "auth-code", state: state }
      }.not_to change(User, :count)

      get "/me"
      expect(JSON.parse(response.body)["id"]).to eq(identity.user_id)
    end
  end

  def authorize_and_capture_state
    allow(Rails.application.credentials).to receive(:strava).and_return(client_id: "test-client", client_secret: "test-secret")
    get "/auth/strava"
    session[:strava_oauth_state]
  end
end
