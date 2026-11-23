module Strava
  # Re-reads one Strava activity (GET /activities/{id}) and makes the local
  # row match it -- shared by StravaController's resync endpoints and
  # StravaWebhookEventJob, so it needs no current_user.
  #
  # - A synced type (StravaSyncJob::SYNCED_TYPES) is upserted through
  #   Strava::ActivityUpsert, creating the row if this user has none yet
  #   (a webhook create event) -- status :kept.
  # - An excluded type, or a 404, is treated the way full-refresh
  #   reconciliation treats it: indistinguishable from deleted. A stored row
  #   is destroyed (:deleted); a row that never existed stays that way
  #   (:skipped).
  # - Any other Strava::Client::Error propagates; the caller decides (502,
  #   a per-row failed count, or a job retry).
  #
  # Idempotent, since one save on Strava can send several webhook events.
  # Two of those can race to create the same new ride (strava_id is unique),
  # so a losing insert re-finds the winner's row and upserts onto it once.
  class ActivityRefresh
    Result = Struct.new(:status, :activity, keyword_init: true) do
      def kept?
        status == :kept
      end
    end

    def self.call(...)
      new(...).call
    end

    def initialize(user:, strava_id:, access_token:, client:, backfill_gear: true)
      @user = user
      @strava_id = strava_id
      @access_token = access_token
      @client = client
      @backfill_gear = backfill_gear
    end

    def call
      activity = user.strava_activities.find_or_initialize_by(strava_id: strava_id)
      raw = client.fetch_activity(strava_id, access_token: access_token)
      return remove(activity) unless StravaSyncJob::SYNCED_TYPES.include?(raw["type"])

      activity = upsert(activity, raw)
      Strava::UncachedGear.call(user, [ activity.gear_id ]) if backfill_gear
      Result.new(status: :kept, activity: activity)
    rescue Strava::Client::NotFoundError
      remove(activity)
    end

    private

    attr_reader :user, :strava_id, :access_token, :client, :backfill_gear

    # Returns the row written -- the concurrent winner's, after a lost race.
    def upsert(activity, raw)
      bike = user.bikes.find_by(strava_gear_id: raw["gear_id"])
      was_new = activity.new_record?
      begin
        write(activity, raw, bike)
      rescue ActiveRecord::RecordNotUnique, ActiveRecord::RecordInvalid => e
        raise unless was_new && duplicate_strava_id?(e)

        write(user.strava_activities.find_by!(strava_id: strava_id), raw, bike)
      end
    end

    def write(activity, raw, bike)
      Strava::ActivityUpsert.call(user: user, activity: activity, raw: raw, bike: bike)
      activity
    end

    def duplicate_strava_id?(error)
      return true if error.is_a?(ActiveRecord::RecordNotUnique)

      error.record.errors.of_kind?(:strava_id, :taken)
    end

    def remove(activity)
      return Result.new(status: :skipped, activity: nil) if activity.new_record?

      activity.destroy
      Result.new(status: :deleted, activity: activity)
    end
  end
end
