require "rails_helper"

RSpec.describe "Auth::Csrf", type: :request do
  describe "GET /auth/csrf" do
    it "returns a token without requiring authentication" do
      get "/auth/csrf"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["csrf_token"]).to be_present
    end
  end
end
