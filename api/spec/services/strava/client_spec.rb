require "rails_helper"

RSpec.describe Strava::Client do
  # No webmock/VCR in this project -- Faraday's own bundled test adapter
  # stubs the HTTP layer with no new dependency, swapped in for the real
  # connection via the client's own (private) memoized `connection` method.
  def stub_connection(client, method:, path:, status:, headers: {}, body: {})
    conn = Faraday.new do |f|
      f.response :json
      f.adapter :test do |stub|
        stub.public_send(method, path) { [status, { "Content-Type" => "application/json" }.merge(headers), body.to_json] }
      end
    end
    allow(client).to receive(:connection).and_return(conn)
  end

  describe "rate limiting" do
    it "raises RateLimitedError with the parsed headers and the next 15-minute boundary as retry_at" do
      client = described_class.new
      stub_connection(
        client, method: :get, path: "/api/v3/activities/1", status: 429,
        headers: {
          "X-ReadRateLimit-Limit" => "100,1000", "X-ReadRateLimit-Usage" => "100,500",
          "X-RateLimit-Limit" => "200,2000", "X-RateLimit-Usage" => "150,900",
        },
      )

      travel_to(Time.utc(2026, 11, 10, 12, 7, 30)) do
        expect { client.fetch_activity(1, access_token: "tok") }.to raise_error(Strava::Client::RateLimitedError) do |error|
          expect(error.read_limit).to eq([100, 1000])
          expect(error.read_usage).to eq([100, 500])
          expect(error.overall_limit).to eq([200, 2000])
          expect(error.overall_usage).to eq([150, 900])
          expect(error.retry_at).to eq(Time.utc(2026, 11, 10, 12, 15, 0))
        end
      end
    end

    it "rolls over into the next hour when already past :45" do
      client = described_class.new
      stub_connection(client, method: :get, path: "/api/v3/activities/1", status: 429)

      travel_to(Time.utc(2026, 11, 10, 12, 50, 0)) do
        expect { client.fetch_activity(1, access_token: "tok") }.to raise_error(Strava::Client::RateLimitedError) do |error|
          expect(error.retry_at).to eq(Time.utc(2026, 11, 10, 13, 0, 0))
        end
      end
    end

    it "carries nil for a missing rate-limit header rather than raising" do
      client = described_class.new
      stub_connection(client, method: :get, path: "/api/v3/activities/1", status: 429)

      expect { client.fetch_activity(1, access_token: "tok") }.to raise_error(Strava::Client::RateLimitedError) do |error|
        expect(error.read_limit).to be_nil
      end
    end
  end

  describe "authentication failure" do
    it "raises AuthenticationError on a 401 from the token endpoint" do
      client = described_class.new
      stub_connection(client, method: :post, path: "/oauth/token", status: 401)

      expect { client.refresh_access_token("stale-token") }.to raise_error(Strava::Client::AuthenticationError)
    end

    it "raises AuthenticationError on a 400 from the token endpoint" do
      client = described_class.new
      stub_connection(client, method: :post, path: "/oauth/token", status: 400)

      expect { client.refresh_access_token("stale-token") }.to raise_error(Strava::Client::AuthenticationError)
    end
  end

  describe "other failures, unchanged" do
    it "still raises NotFoundError on a 404" do
      client = described_class.new
      stub_connection(client, method: :get, path: "/api/v3/activities/1", status: 404)

      expect { client.fetch_activity(1, access_token: "tok") }.to raise_error(Strava::Client::NotFoundError)
    end

    it "raises the plain Error on a 500 from a GET endpoint" do
      client = described_class.new
      stub_connection(client, method: :get, path: "/api/v3/activities/1", status: 500)

      expect { client.fetch_activity(1, access_token: "tok") }.to raise_error(Strava::Client::Error)
    end

    it "raises the plain Error on a 500 from the token endpoint, not AuthenticationError" do
      client = described_class.new
      stub_connection(client, method: :post, path: "/oauth/token", status: 500)

      expect { client.refresh_access_token("stale-token") }.to raise_error do |error|
        expect(error).to be_a(Strava::Client::Error)
        expect(error).not_to be_a(Strava::Client::AuthenticationError)
      end
    end

    it "returns the parsed body on success" do
      client = described_class.new
      stub_connection(client, method: :get, path: "/api/v3/activities/1", status: 200, body: { "id" => 1, "name" => "Ride" })

      expect(client.fetch_activity(1, access_token: "tok")).to eq("id" => 1, "name" => "Ride")
    end
  end
end
