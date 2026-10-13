namespace :strava do
  desc "Sync Strava activities for every user with a connected credential"
  task sync_all: :environment do
    User.joins(:strava_credential).find_each do |user|
      StravaSyncJob.perform_now(user.id)
    end
  end
end
