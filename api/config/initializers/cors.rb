# Be sure to restart your server when you modify this file.

# credentials: true is required for the frontend's fetch(..., { credentials:
# 'include' }) calls to actually carry/receive the session cookie across
# origins (:5173 vs :3000 -- same site, different origin). Without it, the
# browser still sends the cookie, but refuses to let the frontend's
# JavaScript read the response at all -- fetch() just rejects with a
# generic network error, which looks exactly like "not signed in" even when
# the server-side sign-in succeeded. Not gated to development only (unlike
# before): FRONTEND_URL covers production too, once deployed.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch("FRONTEND_URL", "http://localhost:5173")

    resource "*",
      headers: :any,
      methods: %i[get post put patch delete options head],
      credentials: true
  end
end
