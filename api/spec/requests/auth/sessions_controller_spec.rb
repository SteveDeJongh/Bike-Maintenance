require "rails_helper"

RSpec.describe "Auth::Sessions", type: :request do
  describe "POST /auth/login" do
    it "signs in with the correct email and password" do
      user = create(:user, email: "jamie@example.invalid", password: "password123")

      post "/auth/login", params: { email: "jamie@example.invalid", password: "password123" }

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["id"]).to eq(user.id)
    end

    it "is case-insensitive on email" do
      create(:user, email: "jamie@example.invalid", password: "password123")

      post "/auth/login", params: { email: "JAMIE@EXAMPLE.INVALID", password: "password123" }

      expect(response).to have_http_status(:ok)
    end

    it "rejects an incorrect password" do
      create(:user, email: "jamie@example.invalid", password: "password123")

      post "/auth/login", params: { email: "jamie@example.invalid", password: "wrong" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "rejects an unknown email" do
      post "/auth/login", params: { email: "nobody@example.invalid", password: "password123" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "rejects a user with no password set (Google/Strava-only account)" do
      create(:user, email: "jamie@example.invalid", password: nil)

      post "/auth/login", params: { email: "jamie@example.invalid", password: "anything" }

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "DELETE /auth/logout" do
    it "clears the session" do
      user = create(:user)
      sign_in(user)

      delete "/auth/logout"

      expect(response).to have_http_status(:no_content)
      get "/me"
      expect(response).to have_http_status(:unauthorized)
    end

    it "is a no-op when not signed in" do
      delete "/auth/logout"

      expect(response).to have_http_status(:no_content)
    end
  end
end
