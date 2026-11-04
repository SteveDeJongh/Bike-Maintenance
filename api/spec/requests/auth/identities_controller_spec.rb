require "rails_helper"

RSpec.describe "Auth::Identities", type: :request do
  describe "DELETE /me/identities/:provider" do
    it "unlinks a provider when the user has a password to fall back on" do
      user = create(:user, password: "password123")
      create(:user_identity, user: user, provider: "strava")
      sign_in(user)

      delete "/me/identities/strava"

      expect(response).to have_http_status(:no_content)
      expect(user.user_identities.find_by(provider: "strava")).to be_nil
    end

    it "unlinks a provider when another identity remains" do
      user = create(:user, password: nil)
      create(:user_identity, user: user, provider: "strava")
      create(:user_identity, user: user, provider: "google")
      sign_in_via_strava(user)

      delete "/me/identities/google"

      expect(response).to have_http_status(:no_content)
      expect(user.user_identities.find_by(provider: "google")).to be_nil
    end

    it "refuses to remove the last sign-in method" do
      user = create(:user, password: nil)
      create(:user_identity, user: user, provider: "strava")
      sign_in_via_strava(user)

      delete "/me/identities/strava"

      expect(response).to have_http_status(:unprocessable_content)
      expect(user.user_identities.find_by(provider: "strava")).to be_present
    end

    it "404s for a provider not linked to this account" do
      user = create(:user, password: "password123")
      sign_in(user)

      delete "/me/identities/google"

      expect(response).to have_http_status(:not_found)
    end
  end

  def sign_in_via_strava(user)
    identity = user.user_identities.find_by!(provider: "strava")
    allow(Rails.application.credentials).to receive(:strava).and_return(client_id: "test-client", client_secret: "test-secret")
    get "/auth/strava"
    state = session[:strava_oauth_state]

    client = instance_double(Strava::Client)
    allow(Strava::Client).to receive(:new).and_return(client)
    allow(client).to receive(:exchange_code).and_return(
      "access_token" => "at", "refresh_token" => "rt", "expires_at" => 6.hours.from_now.to_i,
      "athlete" => { "id" => identity.uid },
    )
    get "/auth/strava/callback", params: { code: "auth-code", state: state }
  end
end
