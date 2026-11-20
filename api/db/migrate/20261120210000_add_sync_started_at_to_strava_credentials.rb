class AddSyncStartedAtToStravaCredentials < ActiveRecord::Migration[7.1]
  # A signal, not a lock: "an incremental sync is in flight", the
  # incremental counterpart of full_sync_started_at. Feeds
  # GET /strava/status's sync_in_progress.
  def change
    add_column :strava_credentials, :sync_started_at, :datetime
  end
end
