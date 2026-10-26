class AddLastSyncedAtToStravaCredentials < ActiveRecord::Migration[7.1]
  def change
    add_column :strava_credentials, :last_synced_at, :datetime
  end
end
