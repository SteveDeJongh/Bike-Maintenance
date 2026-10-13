class StravaCredential < ApplicationRecord
  REFRESH_BUFFER = 5.minutes

  belongs_to :user

  validates :access_token, :refresh_token, :athlete_id, :expires_at, presence: true
  validates :user_id, uniqueness: true

  # Returns a valid access token, refreshing via the Strava API first if the
  # current one is at or near expiry. Strava rotates the refresh_token on
  # every refresh, so the new one is persisted and the old one discarded.
  def ensure_fresh_access_token!
    return access_token if expires_at > Time.current + REFRESH_BUFFER

    response = Strava::Client.new.refresh_access_token(refresh_token)
    update!(
      access_token: response.fetch("access_token"),
      refresh_token: response.fetch("refresh_token"),
      expires_at: Time.at(response.fetch("expires_at")),
    )
    access_token
  end
end
