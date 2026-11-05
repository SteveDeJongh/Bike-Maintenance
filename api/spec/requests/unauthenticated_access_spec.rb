require "rails_helper"

# Every route in the app, swept once each with no session at all. The
# before_action :require_authentication guard runs ahead of any record
# lookup, so a bogus id (999999) still proves the point -- unauthenticated
# access never even reaches far enough to 404.
RSpec.describe "Unauthenticated access", type: :request do
  PROTECTED_ROUTES = [
    [:get, "/me"], [:patch, "/me"], [:delete, "/me"],
    [:put, "/me/password"],
    [:delete, "/me/identities/strava"],
    [:post, "/auth/email/resend"],

    [:get, "/bikes"], [:post, "/bikes"], [:get, "/bikes/999999"],
    [:patch, "/bikes/999999"], [:delete, "/bikes/999999"], [:post, "/bikes/999999/component_setup"],

    [:get, "/bike_types"], [:post, "/bike_types"], [:get, "/bike_types/999999"],
    [:patch, "/bike_types/999999"], [:delete, "/bike_types/999999"],

    [:get, "/components"], [:post, "/components"], [:get, "/components/999999"],
    [:patch, "/components/999999"], [:delete, "/components/999999"],

    [:get, "/component_assignments"], [:post, "/component_assignments"],
    [:get, "/component_assignments/999999"], [:patch, "/component_assignments/999999"],
    [:delete, "/component_assignments/999999"],

    [:get, "/maintenance_events"], [:post, "/maintenance_events"],
    [:get, "/maintenance_events/999999"], [:patch, "/maintenance_events/999999"],
    [:delete, "/maintenance_events/999999"],

    [:get, "/service_types"], [:post, "/service_types"], [:get, "/service_types/999999"],
    [:patch, "/service_types/999999"], [:delete, "/service_types/999999"],

    [:post, "/bike_component_slots"], [:delete, "/bike_component_slots/999999"],

    [:get, "/table_view_preferences/bikes"], [:patch, "/table_view_preferences/bikes"],

    [:get, "/component_category_settings"], [:patch, "/component_category_settings/chain"],

    [:get, "/category_service_intervals"], [:post, "/category_service_intervals"],
    [:get, "/category_service_intervals/999999"], [:patch, "/category_service_intervals/999999"],
    [:delete, "/category_service_intervals/999999"], [:post, "/category_service_intervals/999999/apply"],

    [:get, "/component_service_intervals"], [:post, "/component_service_intervals"],
    [:get, "/component_service_intervals/999999"], [:patch, "/component_service_intervals/999999"],
    [:delete, "/component_service_intervals/999999"], [:post, "/component_service_intervals/apply_defaults"],

    [:post, "/service_alert_dismissals"], [:post, "/service_alert_dismissals/dismiss_all"],

    [:get, "/dashboard"],
    [:get, "/maintenance_alerts"],
    [:get, "/notification_settings"], [:patch, "/notification_settings"],

    [:get, "/strava/status"], [:post, "/strava/sync"], [:get, "/strava/unmapped_gear"],
    [:get, "/strava/ignored_gear"], [:post, "/strava/ignore_gear"], [:post, "/strava/unignore_gear"],
    [:get, "/strava/mapped_gear"], [:patch, "/strava/mapped_gear/g1"], [:post, "/strava/refresh_gear"],
  ].freeze

  # Intentionally public -- a new/anonymous visitor must be able to reach
  # all of these to register, sign in, reset a password, verify an email,
  # fetch a CSRF token, or complete the Strava OAuth round trip.
  # (POST /auth/login itself is deliberately not swept here: with no
  # credentials it legitimately 401s from Auth::SessionsController's own
  # "incorrect email or password" branch, not from require_authentication --
  # it's covered on its own terms in auth/sessions_controller_spec.rb.)
  PUBLIC_ROUTES = [
    [:post, "/auth/register"], [:delete, "/auth/logout"],
    [:get, "/auth/csrf"],
    [:post, "/auth/password/forgot"], [:post, "/auth/password/reset"],
    [:post, "/auth/email/verify"],
    [:get, "/auth/strava"], [:get, "/auth/strava/callback"],
    [:get, "/up"],
  ].freeze

  PROTECTED_ROUTES.each do |method, path|
    it "returns 401 for #{method.to_s.upcase} #{path}" do
      send(method, path)

      expect(response).to have_http_status(:unauthorized)
    end
  end

  PUBLIC_ROUTES.each do |method, path|
    it "does not return 401 for #{method.to_s.upcase} #{path}" do
      send(method, path)

      expect(response).not_to have_http_status(:unauthorized)
    end
  end
end
