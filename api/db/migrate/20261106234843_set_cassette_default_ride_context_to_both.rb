class SetCassetteDefaultRideContextToBoth < ActiveRecord::Migration[7.1]
  # Migration-local model, not the live app one -- same reasoning as every
  # other migration touching this table.
  class ComponentCategorySettingForMigration < ActiveRecord::Base
    self.table_name = "component_category_settings"
  end

  def up
    # Only rows still at the old seeded default -- a row a user has since
    # manually changed to "indoor_only" (or explicitly back to
    # "outdoor_only") is left alone, same "never overwrite an edited value"
    # spirit as the category backfill migrations.
    ComponentCategorySettingForMigration.where(category: "cassette", default_ride_context: "outdoor_only")
      .update_all(default_ride_context: "both")
  end

  def down
    ComponentCategorySettingForMigration.where(category: "cassette", default_ride_context: "both")
      .update_all(default_ride_context: "outdoor_only")
  end
end
