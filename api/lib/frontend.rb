# The one place that knows the frontend's base URL -- used by redirects
# (StravaController) and mailer views alike, so there's a single source of
# truth instead of each duplicating ENV.fetch("FRONTEND_URL", ...).
module Frontend
  def self.url(path = "")
    "#{ENV.fetch("FRONTEND_URL", "http://localhost:5173")}#{path}"
  end
end
