require "rails_helper"
require "rake"

RSpec.describe "strava:webhook tasks", type: :task do
  before(:all) do
    Rails.application.load_tasks if Rake::Task.tasks.empty?
  end

  let(:client) { instance_double(Strava::Client) }

  before do
    %w[subscribe show unsubscribe].each { |name| Rake::Task["strava:webhook:#{name}"].reenable }
    allow(Strava::Client).to receive(:new).and_return(client)
    allow(Rails.application.credentials).to receive(:strava)
      .and_return(client_id: "c", client_secret: "s", webhook_verify_token: "tok")
  end

  describe "subscribe" do
    it "creates the subscription with the configured verify token and prints its id" do
      expect(client).to receive(:create_push_subscription)
        .with(callback_url: "https://example.test/strava/webhook", verify_token: "tok")
        .and_return("id" => 120_475)

      expect { Rake::Task["strava:webhook:subscribe"].invoke("https://example.test/strava/webhook") }
        .to output(/Created Strava push subscription 120475.*webhook_subscription_id/m).to_stdout
    end

    it "prints the existing subscription instead of failing when one already exists" do
      allow(client).to receive(:create_push_subscription).and_raise(Strava::Client::SubscriptionExistsError)
      allow(client).to receive(:list_push_subscriptions)
        .and_return([ { "id" => 7, "callback_url" => "https://tunnel.test/strava/webhook" } ])

      expect { Rake::Task["strava:webhook:subscribe"].invoke("https://example.test/strava/webhook") }
        .to output(/already exists: 7 -> https:\/\/tunnel\.test\/strava\/webhook.*unsubscribe/m).to_stdout
    end
  end

  describe "show" do
    it "prints the subscription" do
      allow(client).to receive(:list_push_subscriptions).and_return([ { "id" => 7, "callback_url" => "https://x.test/hook" } ])

      expect { Rake::Task["strava:webhook:show"].invoke }.to output("7 -> https://x.test/hook\n").to_stdout
    end

    it "prints none without one" do
      allow(client).to receive(:list_push_subscriptions).and_return([])

      expect { Rake::Task["strava:webhook:show"].invoke }.to output("none\n").to_stdout
    end
  end

  describe "unsubscribe" do
    it "deletes the current subscription" do
      allow(client).to receive(:list_push_subscriptions).and_return([ { "id" => 7, "callback_url" => "https://x.test/hook" } ])
      expect(client).to receive(:delete_push_subscription).with(7)

      expect { Rake::Task["strava:webhook:unsubscribe"].invoke }.to output(/Deleted Strava push subscription 7/).to_stdout
    end
  end
end
