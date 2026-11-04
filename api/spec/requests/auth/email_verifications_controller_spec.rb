require "rails_helper"

RSpec.describe "Auth::EmailVerifications", type: :request do
  describe "POST /auth/email/verify" do
    it "verifies the email and signs in" do
      user = create(:user, email_verified_at: nil)
      token = user.generate_token_for(:email_verification)

      post "/auth/email/verify", params: { token: token }

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["email_verified"]).to be true
      expect(user.reload.email_verified_at).to be_present

      get "/me"
      expect(JSON.parse(response.body)["id"]).to eq(user.id)
    end

    it "rejects an invalid token" do
      post "/auth/email/verify", params: { token: "not-a-real-token" }

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "rejects a token that no longer matches the current email (changed since issuing)" do
      user = create(:user, email: "old@example.invalid", email_verified_at: nil)
      token = user.generate_token_for(:email_verification)
      user.update!(email: "new@example.invalid")

      post "/auth/email/verify", params: { token: token }

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "POST /auth/email/resend" do
    it "sends another verification email when unverified" do
      user = create(:user, email_verified_at: nil)
      sign_in(user)

      expect {
        post "/auth/email/resend"
      }.to have_enqueued_mail(UserMailer, :email_verification).with(user)

      expect(response).to have_http_status(:ok)
    end

    it "does nothing when already verified" do
      user = create(:user, email_verified_at: Time.current)
      sign_in(user)

      expect {
        post "/auth/email/resend"
      }.not_to have_enqueued_mail(UserMailer, :email_verification)

      expect(response).to have_http_status(:ok)
    end

    it "requires being signed in" do
      post "/auth/email/resend"

      expect(response).to have_http_status(:unauthorized)
    end
  end
end
