class ApplicationController < ActionController::API
  # Placeholder until real login/sessions exist — returns the single seeded
  # User. Replace with a real session/token lookup once authentication is
  # built; see CLAUDE.md.
  def current_user
    @current_user ||= User.first!
  end
end
