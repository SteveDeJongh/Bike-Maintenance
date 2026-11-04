require "rails_helper"

RSpec.describe "Rack::Attack throttling", type: :request do
  around do |example|
    # Each example gets a clean slate -- otherwise throttle counts would
    # bleed across examples (and specs would need to run in a fixed order).
    Rack::Attack.cache.store = ActiveSupport::Cache::MemoryStore.new
    example.run
    Rack::Attack.cache.store = Rails.cache
  end

  it "throttles repeated login attempts from the same IP" do
    # A distinct email per attempt isolates the IP throttle from the
    # per-email one (tested separately below) -- otherwise the tighter
    # per-email limit would trip first.
    10.times { |n| post "/auth/login", params: { email: "nobody#{n}@example.invalid", password: "wrong" } }
    expect(response).to have_http_status(:unauthorized)

    post "/auth/login", params: { email: "nobody-overflow@example.invalid", password: "wrong" }

    expect(response).to have_http_status(:too_many_requests)
  end

  it "throttles repeated login attempts against the same email specifically" do
    5.times { post "/auth/login", params: { email: "someone@example.invalid", password: "wrong" } }
    expect(response).to have_http_status(:unauthorized)

    post "/auth/login", params: { email: "someone@example.invalid", password: "wrong" }

    expect(response).to have_http_status(:too_many_requests)
  end

  it "throttles repeated registration attempts from the same IP" do
    5.times { |n| post "/auth/register", params: { user: { name: "X", email: "x#{n}@example.invalid", password: "password123" } } }

    post "/auth/register", params: { user: { name: "X", email: "overflow@example.invalid", password: "password123" } }

    expect(response).to have_http_status(:too_many_requests)
  end

  it "throttles repeated forgot-password attempts against the same email" do
    3.times { post "/auth/password/forgot", params: { email: "someone@example.invalid" } }

    post "/auth/password/forgot", params: { email: "someone@example.invalid" }

    expect(response).to have_http_status(:too_many_requests)
  end

  it "does not throttle unrelated endpoints" do
    15.times { get "/auth/csrf" }

    expect(response).to have_http_status(:ok)
  end
end
