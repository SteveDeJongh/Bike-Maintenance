class AddAnalyticsFieldsToStravaActivities < ActiveRecord::Migration[7.1]
  def change
    add_column :strava_activities, :trainer, :boolean, null: false, default: false
    add_column :strava_activities, :commute, :boolean, null: false, default: false
    add_column :strava_activities, :moving_time, :integer
    add_column :strava_activities, :elapsed_time, :integer
    add_column :strava_activities, :average_speed, :float
    add_column :strava_activities, :max_speed, :float
    add_column :strava_activities, :total_elevation_gain, :float
    add_column :strava_activities, :average_watts, :float
    add_column :strava_activities, :weighted_average_watts, :integer
    add_column :strava_activities, :device_watts, :boolean
    add_column :strava_activities, :kilojoules, :float
    add_column :strava_activities, :average_heartrate, :float
    add_column :strava_activities, :max_heartrate, :float
    add_column :strava_activities, :average_cadence, :float
  end
end
