class Rack::Attack
  # Blocklist/throttle cache -- the default (Rails.cache) is :null_store in
  # test, which would make every throttle a no-op there; that's fine since
  # these are integration behaviors, not something request specs assert on
  # directly. Development/production use whatever Rails.cache is configured
  # to, which is sufficient for a single-process app.
  Rack::Attack.cache.store = Rails.cache

  # Rack::Attack runs ahead of Rails' own parameter parsing, so req.params
  # only sees form-encoded/query params, never a JSON request body (what
  # the real frontend sends). Falls back to reading the body directly in
  # that case -- rewinding it, since the real Rails app still needs to read
  # it afterward.
  def self.email_param(req)
    return req.params["email"]&.strip&.downcase if req.params["email"]
    return nil unless req.content_type&.include?("application/json")

    body = req.body.read
    req.body.rewind
    JSON.parse(body)["email"]&.strip&.downcase
  rescue JSON::ParserError
    nil
  end

  throttle("auth/login/ip", limit: 10, period: 1.minute) do |req|
    req.ip if req.path == "/auth/login" && req.post?
  end

  throttle("auth/login/email", limit: 5, period: 20.minutes) do |req|
    email_param(req) if req.path == "/auth/login" && req.post?
  end

  throttle("auth/register/ip", limit: 5, period: 1.hour) do |req|
    req.ip if req.path == "/auth/register" && req.post?
  end

  throttle("auth/password/forgot/ip", limit: 5, period: 1.hour) do |req|
    req.ip if req.path == "/auth/password/forgot" && req.post?
  end

  throttle("auth/password/forgot/email", limit: 3, period: 1.hour) do |req|
    email_param(req) if req.path == "/auth/password/forgot" && req.post?
  end

  throttle("auth/email/resend/ip", limit: 3, period: 1.hour) do |req|
    req.ip if req.path == "/auth/email/resend" && req.post?
  end
end

Rails.application.config.middleware.use Rack::Attack
