require "rails_helper"

RSpec.describe "Auth::Registrations", type: :request do
  describe "POST /auth/register" do
    it "creates a user, signs them in, and provisions defaults" do
      expect {
        post "/auth/register", params: { user: { name: "Jamie", email: "jamie@example.invalid", password: "password123" } }
      }.to change(User, :count).by(1)

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["name"]).to eq("Jamie")
      expect(body["email"]).to eq("jamie@example.invalid")
      expect(body["email_verified"]).to be false
      expect(body["has_password"]).to be true

      user = User.find(body["id"])
      expect(user.service_types.count).to eq(4)

      get "/me"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["id"]).to eq(user.id)
    end

    it "rejects a duplicate email" do
      create(:user, email: "taken@example.invalid")

      post "/auth/register", params: { user: { name: "Jamie", email: "taken@example.invalid", password: "password123" } }

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "rejects a password shorter than 8 characters" do
      post "/auth/register", params: { user: { name: "Jamie", email: "jamie@example.invalid", password: "short" } }

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "does not require being signed in already" do
      post "/auth/register", params: { user: { name: "Jamie", email: "jamie@example.invalid", password: "password123" } }

      expect(response).to have_http_status(:created)
    end
  end
end
