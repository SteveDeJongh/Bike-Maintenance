class Auth::CsrfController < ApplicationController
  skip_before_action :require_authentication, only: :show

  # Lets the SPA pick up a CSRF token before it's authenticated (e.g. on
  # first load, or on the login/register pages) -- the token is tied to
  # the session, not to a signed-in user, so this works either way.
  def show
    render json: { csrf_token: form_authenticity_token }
  end
end
