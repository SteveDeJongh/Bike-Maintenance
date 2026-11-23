# One Strava push-subscription event (StravaWebhooksController#receive
# enqueues it with the event's permitted fields). Events aren't signed and
# carry no object, so the payload is only ever taken as "something changed
# for athlete X / activity Y": activity creates and updates always re-fetch
# the activity (Strava::ActivityRefresh), whatever `updates` lists. One save
# on Strava can send several events, and processing them is idempotent.
#
# A webhook isn't a sync run: this never touches sync_started_at,
# last_synced_at or last_sync_failed_* (those describe the user-visible
# runs, and useSyncCompletionWatcher keys off them).
#
# With the async in-process adapter, a job still queued when the process
# restarts is lost; the scheduled sync's CURSOR_OVERLAP is the backstop.
class StravaWebhookEventJob < ApplicationJob
  queue_as :default

  RATE_LIMIT_ATTEMPTS = 3
  RATE_LIMIT_FALLBACK_WAIT = 15.minutes

  # Searched bottom-up, so the subclasses below win over this one.
  retry_on Strava::Client::Error, Faraday::TimeoutError, Faraday::ConnectionFailed,
    wait: :polynomially_longer, attempts: 4

  # The refresh token was revoked. The deauthorization event (or the next
  # manual sync) surfaces it to the user; retrying can't help.
  discard_on Strava::Client::AuthenticationError do |job, error|
    Rails.logger.warn("[StravaWebhook] discarded #{job.event_summary}: #{error.class}: #{error.message}")
  end

  # retry_on's wait: proc only receives the execution count, never the
  # error, so waiting until Strava's window resets (retry_at) needs this.
  rescue_from Strava::Client::RateLimitedError do |error|
    if executions < RATE_LIMIT_ATTEMPTS
      retry_job(wait_until: error.retry_at || RATE_LIMIT_FALLBACK_WAIT.from_now)
    else
      Rails.logger.warn("[StravaWebhook] dropped #{event_summary} after #{executions} rate-limited attempts")
    end
  end

  def perform(event)
    @event = event.to_h.with_indifferent_access
    credential = StravaCredential.find_by(athlete_id: @event[:owner_id])
    return log("ignored: no credential for this athlete") if credential.nil?

    case [ @event[:object_type], @event[:aspect_type] ]
    when %w[activity create], %w[activity update]
      refresh_activity(credential)
    when %w[activity delete]
      delete_activity(credential.user)
    when %w[athlete update]
      deauthorize(credential)
    else
      log("ignored: unhandled event")
    end
  end

  def event_summary
    event = @event || arguments.first.to_h.with_indifferent_access
    "#{event[:object_type]}/#{event[:aspect_type]} object=#{event[:object_id]} owner=#{event[:owner_id]}"
  end

  private

  def refresh_activity(credential)
    result = Strava::ActivityRefresh.call(
      user: credential.user, strava_id: @event[:object_id].to_i,
      access_token: credential.ensure_fresh_access_token!, client: Strava::Client.new,
    )
    log(result.status.to_s)
  end

  def delete_activity(user)
    activity = user.strava_activities.find_by(strava_id: @event[:object_id].to_i)
    activity&.destroy
    log(activity ? "deleted" : "nothing to delete")
  end

  # Strava's deauthorization: an athlete update whose updates has
  # "authorized" => "false". The tokens are dead, so the credential goes;
  # rides, gear and the Strava UserIdentity stay (data retention on
  # deauthorization is an open question -- see docs/strava.md).
  def deauthorize(credential)
    return log("ignored: athlete update without deauthorization") unless @event.dig(:updates, :authorized).to_s == "false"

    credential.destroy!
    log("deauthorized: credential removed")
  end

  def log(outcome)
    Rails.logger.info("[StravaWebhook] #{event_summary}: #{outcome}")
  end
end
