class CreateStravaGears < ActiveRecord::Migration[7.1]
  def change
    create_table :strava_gears do |t|
      t.references :user, null: false, foreign_key: true
      t.string :strava_gear_id, null: false
      t.string :name
      t.string :brand_name
      t.string :model
      t.boolean :retired, null: false, default: false
      t.integer :distance_meters
      t.datetime :synced_at

      t.timestamps
    end
    add_index :strava_gears, [:user_id, :strava_gear_id], unique: true
  end
end
