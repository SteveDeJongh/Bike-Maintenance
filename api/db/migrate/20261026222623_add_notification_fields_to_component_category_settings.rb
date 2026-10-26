class AddNotificationFieldsToComponentCategorySettings < ActiveRecord::Migration[7.1]
  def change
    add_column :component_category_settings, :notifications_enabled, :boolean
    add_column :component_category_settings, :warning_threshold_percent, :integer
  end
end
