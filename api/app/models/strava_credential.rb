class StravaCredential < ApplicationRecord
  REFRESH_BUFFER = 5.minutes

  # One full refresh per 15 minutes, once completed. full_sync_started_at
  # (set by the controller right before enqueueing, cleared by the job in
  # an ensure) blocks a *second* request while one is still running --
  # RUNNING_TIMEOUT is a self-healing fallback in case that ensure never
  # ran (a killed worker process), so the lock can't get stuck forever.
  FULL_SYNC_COOLDOWN = 15.minutes
  RUNNING_TIMEOUT = 10.minutes

  belongs_to :user

  validates :access_token, :refresh_token, :athlete_id, :expires_at, presence: true
  validates :user_id, uniqueness: true
  validates :athlete_id, uniqueness: true

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

  # nil when a full refresh can be triggered right now; otherwise the time
  # it becomes available -- the later of "a run is still (plausibly)
  # in-flight" and "the last completed run's cooldown hasn't expired."
  def full_sync_available_at
    blockers = []
    if full_sync_started_at.present? && full_sync_started_at > RUNNING_TIMEOUT.ago
      blockers << full_sync_started_at + RUNNING_TIMEOUT
    end
    if last_full_sync_at.present? && last_full_sync_at > FULL_SYNC_COOLDOWN.ago
      blockers << last_full_sync_at + FULL_SYNC_COOLDOWN
    end
    blockers.max
  end

  def full_sync_available?
    full_sync_available_at.nil?
  end

  # Roughly how many Strava API calls a full refresh would cost right now:
  # ceil(rides / 100) paginated listing calls, + 1 empty final page, +
  # Strava::GearSync's 1 fetch_athlete call, + 1 fetch_gear call per
  # distinct gear id. `gear` reads the StravaGear cache count rather than a
  # fresh distinct-gear_id scan over activities -- in steady state these
  # converge (GearSync upserts every known id into that cache), and this is
  # a cheap pre-existing count instead of a `.distinct.pluck` that could
  # scan thousands of rows. Used to decide whether a bulk resync of k rides
  # (k calls) or a full refresh is cheaper -- see StravaController.
  def full_sync_request_estimate
    rides = user.strava_activities.count
    gear = user.strava_gears.count
    (rides / 100.0).ceil + 2 + gear
  end
end
