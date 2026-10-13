require "faraday"

module Strava
  class Client
    class Error < StandardError; end

    BASE_URL = "https://www.strava.com"

    def exchange_code(code)
      request_token(grant_type: "authorization_code", code: code)
    end

    def refresh_access_token(refresh_token)
      request_token(grant_type: "refresh_token", refresh_token: refresh_token)
    end

    def fetch_activities(access_token:, after: nil, page: 1, per_page: 100)
      params = { page: page, per_page: per_page, after: after }.compact
      response = connection.get("/api/v3/athlete/activities", params) do |req|
        req.headers["Authorization"] = "Bearer #{access_token}"
      end

      raise Error, "Strava activities request failed: #{response.status}" unless response.success?

      response.body
    end

    private

    def request_token(extra_params)
      response = connection.post("/oauth/token", {
        client_id: credentials[:client_id],
        client_secret: credentials[:client_secret],
      }.merge(extra_params))

      raise Error, "Strava token request failed: #{response.status}" unless response.success?

      response.body
    end

    def credentials
      Rails.application.credentials.strava
    end

    def connection
      @connection ||= Faraday.new(url: BASE_URL) do |f|
        f.request :url_encoded
        f.response :json
        f.adapter Faraday.default_adapter
      end
    end
  end
end
