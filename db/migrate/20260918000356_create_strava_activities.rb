class CreateStravaActivities < ActiveRecord::Migration[7.1]
  def change
    create_table :strava_activities do |t|
      t.bigint :strava_id, null: false
      t.references :bike, null: true, foreign_key: true
      t.integer :distance_meters, null: false, default: 0
      t.date :moved_on, null: false
      t.string :name
      t.string :activity_type
      t.datetime :synced_at

      t.timestamps
    end

    add_index :strava_activities, :strava_id, unique: true
  end
end
