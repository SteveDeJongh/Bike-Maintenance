class UseAtSuffixForDatetimeColumns < ActiveRecord::Migration[7.1]
  def up
    rename_column :component_assignments, :started_on, :started_at
    rename_column :component_assignments, :ended_on, :ended_at
    rename_column :strava_activities, :moved_on, :moved_at
    rename_column :maintenance_events, :performed_on, :performed_at

    change_column :strava_activities, :moved_at, :datetime, null: false
    change_column :maintenance_events, :performed_at, :datetime
  end

  def down
    change_column :maintenance_events, :performed_at, :date
    change_column :strava_activities, :moved_at, :date, null: false

    rename_column :maintenance_events, :performed_at, :performed_on
    rename_column :strava_activities, :moved_at, :moved_on
    rename_column :component_assignments, :ended_at, :ended_on
    rename_column :component_assignments, :started_at, :started_on
  end
end
