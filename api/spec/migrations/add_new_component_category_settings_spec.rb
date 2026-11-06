require "rails_helper"
require Rails.root.join("db/migrate/20261104222336_add_new_component_category_settings.rb").to_s

# No existing migration-spec convention in this app -- added narrowly here
# because this one migration carries real backfill logic (not just a schema
# change) worth proving directly, the same way a data-migration bug would
# otherwise only surface by inspecting production data after the fact.
RSpec.describe AddNewComponentCategorySettings do
  describe "#up" do
    it "backfills the six new categories for every existing user, without overwriting an existing custom row" do
      user = create(:user)
      new_categories = %w[front_suspension shock frame seat_post power_meter pedals]
      # Users::Provision already seeded these on create(:user) -- clear them
      # so the migration's own INSERT isn't fighting the unique index, then
      # recreate one as a "pre-existing custom row" to prove ON CONFLICT
      # DO NOTHING really leaves it alone.
      user.component_category_settings.where(category: new_categories).delete_all
      custom = create(:component_category_setting, user: user, category: "front_suspension", default_ride_context: "indoor_only")

      described_class.new.up

      settings = user.component_category_settings.where(category: new_categories).index_by(&:category)
      expect(settings.keys).to match_array(new_categories)
      expect(settings["front_suspension"]).to eq(custom)
      expect(settings["front_suspension"].default_ride_context).to eq("indoor_only") # untouched
      expect(settings["shock"].default_ride_context).to eq("outdoor_only")
      expect(settings["frame"].default_ride_context).to eq("both")
      expect(settings["seat_post"].default_ride_context).to eq("both")
      expect(settings["power_meter"].default_ride_context).to eq("both")
      expect(settings["pedals"].default_ride_context).to eq("both")
    end

    it "is a no-op when every user already has these rows" do
      user = create(:user)
      # Users::Provision no longer seeds "shock" (retired in favor of
      # rear_suspension -- see RemoveShockRenameRearShockToRearSuspension),
      # but this frozen migration's own category list still includes it, so
      # create it directly to set up the "already has these rows"
      # precondition #up is being proven idempotent against.
      create(:component_category_setting, user: user, category: "shock")

      expect { described_class.new.up }.not_to change(ComponentCategorySetting, :count)
    end

    it "never creates a row for another user" do
      user = create(:user)
      other_user = create(:user)

      described_class.new.up

      expect(user.component_category_settings.where(category: "shock")).to exist
      expect(other_user.component_category_settings.where(category: "shock")).to exist
    end
  end
end
