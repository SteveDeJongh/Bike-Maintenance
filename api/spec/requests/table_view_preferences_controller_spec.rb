require "rails_helper"

RSpec.describe "TableViewPreferences", type: :request do
  # current_user resolves to User.first! — created first in each example so
  # it reliably has the lowest id, ahead of any other user a factory call
  # might incidentally create.
  let!(:current_user) { create(:user) }

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
  end
end
