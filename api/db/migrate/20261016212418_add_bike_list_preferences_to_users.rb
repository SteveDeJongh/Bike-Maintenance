class AddBikeListPreferencesToUsers < ActiveRecord::Migration[7.1]
  def change
    add_column :users, :bike_list_preferences, :jsonb, default: {}, null: false
  end
end
