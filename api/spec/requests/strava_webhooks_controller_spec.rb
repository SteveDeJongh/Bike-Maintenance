require "rails_helper"

RSpec.describe "Strava webhooks", type: :request do
  include ActiveJob::TestHelper

  let(:strava_config) { { client_id: "test-client", client_secret: "test-secret", webhook_verify_token: "s3cret-token" } }

  before { allow(Rails.application.credentials).to receive(:strava).and_return(strava_config) }

  # Strava sends neither a session nor a CSRF token. Force forgery
  # protection on (test.rb turns it off) so a missing skip would fail here.
  around do |example|
    original = ApplicationController.allow_forgery_protection
    ApplicationController.allow_forgery_protection = true
    example.run
  ensure
    ApplicationController.allow_forgery_protection = original
  end

  def verify(token: "s3cret-token", mode: "subscribe", challenge: "15f7d1a91c1f40f8a748fd134752feb3")
    get "/strava/webhook", params: { "hub.mode" => mode, "hub.challenge" => challenge, "hub.verify_token" => token }.compact
  end

  def event(**overrides)
    {
      object_type: "activity", object_id: 1_360_128_428, aspect_type: "update", owner_id: 134_815,
      subscription_id: 120_475, event_time: 1_516_126_040, updates: { title: "Messy" },
    }.merge(overrides)
  end

  describe "GET /strava/webhook" do
    it "echoes the challenge for the configured verify token" do
      verify

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to eq("hub.challenge" => "15f7d1a91c1f40f8a748fd134752feb3")
    end

    it "403s for a wrong token" do
      verify(token: "guess")
      expect(response).to have_http_status(:forbidden)
    end

    it "403s with no token" do
      verify(token: nil)
      expect(response).to have_http_status(:forbidden)
    end

    it "403s for a mode other than subscribe" do
      verify(mode: "unsubscribe")
      expect(response).to have_http_status(:forbidden)
    end

    it "403s when no verify token is configured, even for a blank token" do
      strava_config.delete(:webhook_verify_token)

      verify(token: "")
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /strava/webhook" do
    it "enqueues the event and returns 200 with no session or CSRF token" do
      expect { post "/strava/webhook", params: event, as: :json }
        .to have_enqueued_job(StravaWebhookEventJob).with(
          hash_including("object_type" => "activity", "object_id" => 1_360_128_428, "aspect_type" => "update",
            "owner_id" => 134_815, "updates" => { "title" => "Messy" }),
        )

      expect(response).to have_http_status(:ok)
    end

    it "enqueues when the configured subscription id matches" do
      strava_config[:webhook_subscription_id] = 120_475

      expect { post "/strava/webhook", params: event, as: :json }.to have_enqueued_job(StravaWebhookEventJob)
      expect(response).to have_http_status(:ok)
    end

    it "returns 200 and enqueues nothing for another subscription" do
      strava_config[:webhook_subscription_id] = 999

      expect { post "/strava/webhook", params: event, as: :json }.not_to have_enqueued_job
      expect(response).to have_http_status(:ok)
    end

    it "400s and enqueues nothing when a required field is missing" do
      expect { post "/strava/webhook", params: event.except(:owner_id), as: :json }.not_to have_enqueued_job
      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "a user whose credential a deauthorization removed" do
    let(:user) { create(:user) }

    before do
      create(:strava_activity, user: user, bike: create(:bike, user: user))
      ApplicationController.allow_forgery_protection = false
      sign_in(user)
    end

    it "gets a clean disconnected status and dashboard" do
      get "/strava/status"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["connected"]).to be(false)

      get "/dashboard"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig("sync", "connected")).to be(false)
    end

    it "gets a 422, not a 500, from refresh gear" do
      post "/strava/refresh_gear"

      expect(response).to have_http_status(:unprocessable_content)
      expect(JSON.parse(response.body)).to eq("base" => [ "Strava is not connected" ])
    end
  end
end
