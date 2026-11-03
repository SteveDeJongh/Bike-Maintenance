module UserSerialization
  extend ActiveSupport::Concern

  private

  # The one shared shape of "the current user" returned by /me and by
  # every endpoint that establishes or changes a session (login, register,
  # OAuth callbacks) -- so the frontend never needs a follow-up GET /me
  # just to read back what it already just did.
  def user_json(user)
    {
      id: user.id,
      name: user.name,
      email: user.email,
      email_verified: user.email_verified_at.present?,
      has_password: user.has_password?,
      identities: user.user_identities.map { |identity| { provider: identity.provider, email: identity.email } },
      strava_connected: user.strava_credential.present?,
    }
  end
end
