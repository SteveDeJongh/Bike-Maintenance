class ReplaceAccruesIndoorMileageWithDefaultRideContextOnComponentCategorySettings < ActiveRecord::Migration[7.1]
  def up
    add_column :component_category_settings, :default_ride_context, :string, default: "both", null: false
    execute "UPDATE component_category_settings SET default_ride_context = 'outdoor_only' WHERE accrues_indoor_mileage = FALSE"
    remove_column :component_category_settings, :accrues_indoor_mileage
  end

  def down
    add_column :component_category_settings, :accrues_indoor_mileage, :boolean, default: true, null: false
    execute "UPDATE component_category_settings SET accrues_indoor_mileage = FALSE WHERE default_ride_context = 'outdoor_only'"
    remove_column :component_category_settings, :default_ride_context
  end
end
