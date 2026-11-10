require "faraday"

module Strava
  class Client
    class Error < StandardError; end
    class NotFoundError < Error; end

    # Strava's OAuth token endpoint rejecting a revoked/invalid refresh_token
    # -- raised only from request_token (exchange_code/refresh_access_token),
    # not from the general get helper, since that's the one concrete scenario
    # this is for (see StravaSyncJob's failure classification).
    class AuthenticationError < Error; end

    # Raised on HTTP 429. Carries the parsed X-ReadRateLimit-*/X-RateLimit-*
    # headers (each a [fifteen_min, daily] pair, or nil if the header was
    # missing) plus retry_at, the next :00/:15/:30/:45 UTC boundary -- when
    # Strava's 15-minute read window resets.
    class RateLimitedError < Error
      attr_reader :read_limit, :read_usage, :overall_limit, :overall_usage, :retry_at

      def initialize(message, read_limit:, read_usage:, overall_limit:, overall_usage:, retry_at:)
        super(message)
        @read_limit = read_limit
        @read_usage = read_usage
        @overall_limit = overall_limit
        @overall_usage = overall_usage
        @retry_at = retry_at
      end
    end

    BASE_URL = "https://www.strava.com"

    def exchange_code(code)
      request_token(grant_type: "authorization_code", code: code)
    end

    def refresh_access_token(refresh_token)
      request_token(grant_type: "refresh_token", refresh_token: refresh_token)
    end

    def fetch_activities(access_token:, after: nil, page: 1, per_page: 100)
      get("/api/v3/athlete/activities", access_token: access_token,
        params: { page: page, per_page: per_page, after: after })
    end

    def fetch_athlete(access_token:)
      get("/api/v3/athlete", access_token: access_token)
    end

    def fetch_gear(gear_id, access_token:)
      get("/api/v3/gear/#{gear_id}", access_token: access_token)
    end

    def fetch_activity(id, access_token:)
      get("/api/v3/activities/#{id}", access_token: access_token)
    end

    private

    def get(path, access_token:, params: {})
      response = connection.get(path, params.compact) do |req|
        req.headers["Authorization"] = "Bearer #{access_token}"
      end

      raise NotFoundError, "Strava request to #{path} failed: 404" if response.status == 404
      raise rate_limited_error(path, response) if response.status == 429
      raise Error, "Strava request to #{path} failed: #{response.status}" unless response.success?

      response.body
    end

    def request_token(extra_params)
      response = connection.post("/oauth/token", {
        client_id: credentials[:client_id],
        client_secret: credentials[:client_secret],
      }.merge(extra_params))

      if [400, 401].include?(response.status)
        raise AuthenticationError, "Strava token request failed: #{response.status}"
      end
      raise Error, "Strava token request failed: #{response.status}" unless response.success?

      response.body
    end

    def rate_limited_error(path, response)
      RateLimitedError.new(
        "Strava request to #{path} was rate limited",
        read_limit: parse_rate_limit_pair(response.headers["X-ReadRateLimit-Limit"]),
        read_usage: parse_rate_limit_pair(response.headers["X-ReadRateLimit-Usage"]),
        overall_limit: parse_rate_limit_pair(response.headers["X-RateLimit-Limit"]),
        overall_usage: parse_rate_limit_pair(response.headers["X-RateLimit-Usage"]),
        retry_at: next_window_boundary,
      )
    end

    def parse_rate_limit_pair(header_value)
      return nil if header_value.blank?

      header_value.split(",").map { |n| n.strip.to_i }
    end

    # Strava's 15-minute read window resets at :00/:15/:30/:45 UTC -- the
    # next boundary strictly after now, regardless of whether now already
    # sits exactly on one (the window that just started still runs until the
    # *next* one).
    def next_window_boundary
      now = Time.current.utc
      quarter = (now.min / 15 + 1) * 15
      if quarter >= 60
        now.change(min: 0, sec: 0) + 1.hour
      else
        now.change(min: quarter, sec: 0)
      end
    end

    def credentials
      Rails.application.credentials.strava
    end

    def connection
      @connection ||= Faraday.new(url: BASE_URL) do |f|
        f.request :url_encoded
        f.response :json
        f.options.open_timeout = 10
        f.options.timeout = 15
        f.adapter Faraday.default_adapter
      end
    end
  end
end
