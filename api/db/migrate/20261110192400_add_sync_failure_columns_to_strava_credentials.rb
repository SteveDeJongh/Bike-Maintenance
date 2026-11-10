class AddSyncFailureColumnsToStravaCredentials < ActiveRecord::Migration[7.1]
  def change
    add_column :strava_credentials, :last_sync_failed_at, :datetime
    add_column :strava_credentials, :last_sync_error, :string
    add_column :strava_credentials, :last_sync_failed_kind, :string
    add_column :strava_credentials, :last_sync_retry_at, :datetime
  end
end
