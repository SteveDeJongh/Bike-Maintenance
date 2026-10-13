class AddGearIdToStravaActivities < ActiveRecord::Migration[7.1]
  def change
    add_column :strava_activities, :gear_id, :string
  end
end
