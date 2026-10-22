namespace :strava do
  desc "Sync Strava activities for every user with a connected credential"
  task sync_all: :environment do
    User.joins(:strava_credential).find_each do |user|
      StravaSyncJob.perform_now(user.id)
    end
  end

  desc "Full resync (ignoring the incremental cursor) for every user with a connected credential -- " \
    "use once after changing which Strava activity types are synced, to backfill previously-skipped history"
  task resync_all: :environment do
    User.joins(:strava_credential).find_each do |user|
      StravaSyncJob.perform_now(user.id, full_resync: true)
    end
  end
end
