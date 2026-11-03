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
end
