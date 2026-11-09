class AddFullSyncColumnsToStravaCredentials < ActiveRecord::Migration[7.1]
  def change
    # last_full_sync_at: set when a full refresh completes without error --
    # backs the 15-minute cooldown. full_sync_started_at: set by the
    # controller right before enqueueing, cleared by the job in an ensure --
    # backs the "don't queue a second one while one is running" guard, with
    # a staleness fallback (see StravaCredential::RUNNING_TIMEOUT) in case
    # the ensure never runs (a killed worker process).
    add_column :strava_credentials, :last_full_sync_at, :datetime
    add_column :strava_credentials, :full_sync_started_at, :datetime
  end
end
