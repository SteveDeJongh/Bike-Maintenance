class RemoveBikeListPreferencesFromUsers < ActiveRecord::Migration[7.1]
  def change
    remove_column :users, :bike_list_preferences, :jsonb, default: {}, null: false
  end
end
