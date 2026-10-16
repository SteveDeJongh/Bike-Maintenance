require "rails_helper"

RSpec.describe "UserPreferences", type: :request do
  # current_user resolves to User.first! — created first in each example so
  # it reliably has the lowest id, ahead of any other user a factory call
  # might incidentally create.
  let!(:current_user) { create(:user) }

  describe "GET /user_preferences" do
    it "returns an empty bike_list_preferences for a fresh user" do
      get "/user_preferences"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq("bike_list_preferences" => {})
    end

    it "returns the saved bike_list_preferences" do
      current_user.update!(bike_list_preferences: { "sort_column" => "name", "sort_direction" => "asc" })

      get "/user_preferences"

      expect(JSON.parse(response.body)).to eq(
        "bike_list_preferences" => { "sort_column" => "name", "sort_direction" => "asc" },
      )
    end
  end

  describe "PATCH /user_preferences" do
    it "saves the given bike_list_preferences" do
      patch "/user_preferences", params: {
        user_preferences: {
          bike_list_preferences: { visible_columns: ["total_distance"], sort_column: "total_distance", sort_direction: "desc" },
        },
      }

      expect(response).to have_http_status(:ok)
      expect(current_user.reload.bike_list_preferences).to eq(
        "visible_columns" => ["total_distance"], "sort_column" => "total_distance", "sort_direction" => "desc",
      )
    end

    it "replaces the whole value rather than merging with what was there before" do
      current_user.update!(bike_list_preferences: { "sort_column" => "name", "sort_direction" => "asc" })

      patch "/user_preferences", params: {
        user_preferences: { bike_list_preferences: { visible_columns: ["total_distance"] } },
      }

      expect(current_user.reload.bike_list_preferences).to eq("visible_columns" => ["total_distance"])
    end
  end
end
