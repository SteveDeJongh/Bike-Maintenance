require "rails_helper"

RSpec.describe "Auth::Passwords", type: :request do
  describe "POST /auth/password/forgot" do
    it "sends a reset email and returns 200 when the email matches an account" do
      user = create(:user, email: "jamie@example.invalid")

      expect {
        post "/auth/password/forgot", params: { email: "jamie@example.invalid" }
      }.to have_enqueued_mail(UserMailer, :password_reset).with(user)

      expect(response).to have_http_status(:ok)
    end

    it "returns 200 even when no account matches, revealing nothing" do
      post "/auth/password/forgot", params: { email: "nobody@example.invalid" }

      expect(response).to have_http_status(:ok)
    end
  end

  describe "POST /auth/password/reset" do
    it "sets the new password, signs in, and the token cannot be reused" do
      user = create(:user, password: "password123")
      token = user.generate_token_for(:password_reset)

      post "/auth/password/reset", params: { token: token, password: "newpassword123" }

      expect(response).to have_http_status(:ok)
      expect(user.reload.authenticate("newpassword123")).to eq(user)

      get "/me"
      expect(JSON.parse(response.body)["id"]).to eq(user.id)

      # The salt changed when the password did, so the same token is dead.
      post "/auth/password/reset", params: { token: token, password: "anotherpassword" }
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "rejects an invalid token" do
      post "/auth/password/reset", params: { token: "not-a-real-token", password: "newpassword123" }

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "rejects a blank password" do
      user = create(:user, password: "password123")
      token = user.generate_token_for(:password_reset)

      post "/auth/password/reset", params: { token: token, password: "" }

      expect(response).to have_http_status(:unprocessable_content)
      expect(user.reload.authenticate("password123")).to eq(user)
    end

    it "rejects a token older than 20 minutes" do
      user = create(:user, password: "password123")
      token = user.generate_token_for(:password_reset)

      travel 21.minutes do
        post "/auth/password/reset", params: { token: token, password: "newpassword123" }
      end

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "lets a Google/Strava-only user (no password yet) set one" do
      user = create(:user, password: nil)
      token = user.generate_token_for(:password_reset)

      post "/auth/password/reset", params: { token: token, password: "newpassword123" }

      expect(response).to have_http_status(:ok)
      expect(user.reload.has_password?).to be true
    end
  end

  describe "PUT /me/password" do
    it "sets a password for a user who doesn't have one yet, without requiring current_password" do
      user = create(:user, password: nil)
      sign_in_via_strava(user, athlete_id: 999)

      put "/me/password", params: { password: "newpassword123" }

      expect(response).to have_http_status(:ok)
      expect(user.reload.has_password?).to be true
    end

    it "changes an existing password when current_password is correct" do
      user = create(:user, password: "password123")
      sign_in(user)

      put "/me/password", params: { current_password: "password123", password: "newpassword123" }

      expect(response).to have_http_status(:ok)
      expect(user.reload.authenticate("newpassword123")).to eq(user)
    end

    it "rejects an incorrect current_password" do
      user = create(:user, password: "password123")
      sign_in(user)

      put "/me/password", params: { current_password: "wrong", password: "newpassword123" }

      expect(response).to have_http_status(:unauthorized)
      expect(user.reload.authenticate("password123")).to eq(user)
    end

    it "requires being signed in" do
      put "/me/password", params: { password: "newpassword123" }

      expect(response).to have_http_status(:unauthorized)
    end
  end

  # A password-less (Google/Strava-only) user has no way to go through
  # POST /auth/login, so establishing a session for one means actually
  # going through the Strava callback -- mirrors the pattern in
  # strava_controller_spec.rb.
  def sign_in_via_strava(user, athlete_id:)
    create(:user_identity, user: user, provider: "strava", uid: athlete_id.to_s)
    allow(Rails.application.credentials).to receive(:strava).and_return(client_id: "test-client", client_secret: "test-secret")
    get "/auth/strava"
    state = session[:strava_oauth_state]

    client = instance_double(Strava::Client)
    allow(Strava::Client).to receive(:new).and_return(client)
    allow(client).to receive(:exchange_code).and_return(
      "access_token" => "at", "refresh_token" => "rt", "expires_at" => 6.hours.from_now.to_i,
      "athlete" => { "id" => athlete_id },
    )
    get "/auth/strava/callback", params: { code: "auth-code", state: state }
  end
end
