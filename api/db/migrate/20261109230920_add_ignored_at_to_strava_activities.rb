class AddIgnoredAtToStravaActivities < ActiveRecord::Migration[7.1]
  def change
    # Ride-level "don't track this" decision, mirroring StravaGear#ignored_at
    # -- only meaningful while bike_id IS NULL (see the model validation);
    # attribution always clears it, so a ride is never both attributed and
    # ignored.
    add_column :strava_activities, :ignored_at, :datetime
  end
end
