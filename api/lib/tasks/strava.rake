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

# The app's Strava push subscription (docs/strava.md, "Webhooks"). Strava
# allows ONE subscription per app, so a dev-tunnel subscription has to be
# removed (strava:webhook:unsubscribe) before production can subscribe.
namespace :strava do
  namespace :webhook do
    desc "Create the Strava push subscription for CALLBACK_URL (https://<host>/strava/webhook) -- " \
      "one per app: unsubscribe a dev-tunnel subscription before subscribing production"
    task :subscribe, [:callback_url] => :environment do |_task, args|
      callback_url = args[:callback_url].presence || abort("Usage: bin/rails \"strava:webhook:subscribe[https://host/strava/webhook]\"")
      verify_token = Rails.application.credentials.strava&.[](:webhook_verify_token).presence ||
        abort("Set strava.webhook_verify_token in credentials first (bin/rails credentials:edit).")

      client = Strava::Client.new
      begin
        subscription = client.create_push_subscription(callback_url: callback_url, verify_token: verify_token)
        puts "Created Strava push subscription #{subscription['id']} for #{callback_url}."
        puts "Store it as strava.webhook_subscription_id in credentials (bin/rails credentials:edit)."
      rescue Strava::Client::SubscriptionExistsError
        existing = client.list_push_subscriptions.first
        puts "A Strava push subscription already exists: #{existing ? "#{existing['id']} -> #{existing['callback_url']}" : '(none listed)'}"
        puts "Only one is allowed per app; run strava:webhook:unsubscribe first to replace it."
      end
    end

    desc "Show the app's Strava push subscription (id and callback URL), or none"
    task show: :environment do
      subscription = Strava::Client.new.list_push_subscriptions.first
      puts subscription ? "#{subscription['id']} -> #{subscription['callback_url']}" : "none"
    end

    desc "Delete the app's Strava push subscription -- required before another callback URL " \
      "(production, after a dev tunnel) can subscribe"
    task unsubscribe: :environment do
      client = Strava::Client.new
      subscription = client.list_push_subscriptions.first
      next puts("none") unless subscription

      client.delete_push_subscription(subscription["id"])
      puts "Deleted Strava push subscription #{subscription['id']} (#{subscription['callback_url']})."
    end
  end
end
