require "rails_helper"

RSpec.describe "Me", type: :request do
  describe "GET /me" do
    it "returns the signed-in user" do
      user = create(:user, name: "Jamie")
      sign_in(user)

      get "/me"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Jamie")
    end

    it "returns 401 when not signed in" do
      get "/me"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "PATCH /me" do
    it "updates the name" do
      user = create(:user)
      sign_in(user)

      patch "/me", params: { user: { name: "New Name" } }

      expect(response).to have_http_status(:ok)
      expect(user.reload.name).to eq("New Name")
    end

    it "clears email_verified_at and sends a new verification email when the email changes" do
      user = create(:user, email: "old@example.invalid", email_verified_at: Time.current)
      sign_in(user)

      expect {
        patch "/me", params: { user: { email: "new@example.invalid" } }
      }.to have_enqueued_mail(UserMailer, :email_verification)

      expect(response).to have_http_status(:ok)
      user.reload
      expect(user.email).to eq("new@example.invalid")
      expect(user.email_verified_at).to be_nil
    end

    it "does not touch email_verified_at when the email isn't part of the update" do
      user = create(:user, email_verified_at: Time.current)
      sign_in(user)

      patch "/me", params: { user: { name: "New Name" } }

      expect(user.reload.email_verified_at).to be_present
    end

    it "rejects a duplicate email" do
      create(:user, email: "taken@example.invalid")
      user = create(:user)
      sign_in(user)

      patch "/me", params: { user: { email: "taken@example.invalid" } }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "DELETE /me" do
    it "deletes the account and everything it owns, given the correct password" do
      user = create(:user, password: "password123")
      bike = create(:bike, user: user)
      sign_in(user)

      delete "/me", params: { password: "password123" }

      expect(response).to have_http_status(:no_content)
      expect(User.exists?(user.id)).to be false
      expect(Bike.exists?(bike.id)).to be false

      get "/me"
      expect(response).to have_http_status(:unauthorized)
    end

    it "rejects an incorrect password" do
      user = create(:user, password: "password123")
      sign_in(user)

      delete "/me", params: { password: "wrong" }

      expect(response).to have_http_status(:unauthorized)
      expect(User.exists?(user.id)).to be true
    end

    it "requires no password confirmation for a Google/Strava-only account" do
      user = create(:user, password: nil)
      create(:user_identity, user: user, provider: "strava")
      sign_in_via_identity(user, "strava")

      delete "/me"

      expect(response).to have_http_status(:no_content)
      expect(User.exists?(user.id)).to be false
    end
  end

  def sign_in_via_identity(user, provider)
    identity = user.user_identities.find_by!(provider: provider)
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
