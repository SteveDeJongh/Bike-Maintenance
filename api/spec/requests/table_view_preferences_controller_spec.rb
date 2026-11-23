require "rails_helper"

RSpec.describe "TableViewPreferences", type: :request do
  let!(:current_user) { create(:user) }
  before { sign_in(current_user) }

  describe "GET /table_view_preferences/:table_key" do
    it "returns an empty hash when no preference exists for that table_key yet" do
      get "/table_view_preferences/bikes"

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq("data" => {})
    end

    it "returns the saved data for that table_key" do
      create(:table_view_preference, user: current_user, table_key: "bikes",
        data: { "sort_column" => "name", "sort_direction" => "asc" })

      get "/table_view_preferences/bikes"

      expect(JSON.parse(response.body)).to eq(
        "data" => { "sort_column" => "name", "sort_direction" => "asc" },
      )
    end
  end

  describe "PATCH /table_view_preferences/:table_key" do
    it "round-trips the activity log's group_by alongside its other keys" do
      %w[none week].each do |value|
        data = { columns: [ "bike" ], sort_column: "date", sort_direction: "desc", kinds: [ "ride" ], group_by: value }
        patch "/table_view_preferences/activity_log", params: { table_view_preference: { data: data } }, as: :json

        expect(response).to have_http_status(:ok)
        get "/table_view_preferences/activity_log"
        expect(JSON.parse(response.body)["data"]).to include("group_by" => value, "kinds" => [ "ride" ])
      end
    end

    it "rejects an unknown group_by, keeping the saved value" do
      patch "/table_view_preferences/activity_log", params: { table_view_preference: { data: { group_by: "week" } } }, as: :json
      patch "/table_view_preferences/activity_log", params: { table_view_preference: { data: { group_by: "month" } } }, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)["data"].first).to include("group_by")
      expect(current_user.table_view_preferences.find_by(table_key: "activity_log").data["group_by"]).to eq("week")
    end

    it "creates a preference on first write" do
      expect {
        patch "/table_view_preferences/bikes", params: {
          table_view_preference: { data: { columns: ["total_distance"], sort_column: "name", sort_direction: "asc" } },
        }
      }.to change(TableViewPreference, :count).by(1)

      expect(response).to have_http_status(:ok)
      expect(current_user.table_view_preferences.find_by(table_key: "bikes").data).to eq(
        "columns" => ["total_distance"], "sort_column" => "name", "sort_direction" => "asc",
      )
    end

    it "replaces the whole value rather than merging with what was there before" do
      create(:table_view_preference, user: current_user, table_key: "bikes",
        data: { "sort_column" => "name", "sort_direction" => "asc" })

      patch "/table_view_preferences/bikes", params: {
        table_view_preference: { data: { columns: ["total_distance"] } },
      }

      expect(current_user.table_view_preferences.find_by(table_key: "bikes").data).to eq(
        "columns" => ["total_distance"],
      )
    end

    it "does not collide across different table_keys for the same user" do
      patch "/table_view_preferences/bikes", params: { table_view_preference: { data: { columns: ["name"] } } }
      patch "/table_view_preferences/components", params: { table_view_preference: { data: { columns: ["label"] } } }

      expect(current_user.table_view_preferences.find_by(table_key: "bikes").data).to eq("columns" => ["name"])
      expect(current_user.table_view_preferences.find_by(table_key: "components").data).to eq("columns" => ["label"])
    end

    it "never touches another user's preference for the same table_key" do
      other_preference = create(:table_view_preference, table_key: "bikes", data: { "columns" => ["name"] })

      patch "/table_view_preferences/bikes", params: { table_view_preference: { data: { columns: ["other"] } } }

      expect(other_preference.reload.data).to eq("columns" => ["name"])
    end
  end

  describe "cross-account isolation" do
    it "GET never returns another user's preference for the same table_key" do
      create(:table_view_preference, table_key: "bikes", data: { "columns" => ["name"] })

      get "/table_view_preferences/bikes"

      expect(JSON.parse(response.body)).to eq("data" => {})
    end
  end
end
