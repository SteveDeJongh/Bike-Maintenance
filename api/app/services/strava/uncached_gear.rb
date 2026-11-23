module Strava
  # Fetches and caches StravaGear for any gear id not already known for this
  # user -- a single-ride refresh (StravaController's resync endpoints,
  # StravaWebhookEventJob via ActivityRefresh) skips the full Strava::GearSync
  # (which also hits GET /athlete and every other already-known id), so
  # without this a ride that picks up a brand-new gear id would leave the
  # Rides tab's Gear column blank, the Gear tab not listing it, and "Resolve
  # gear" leading nowhere, until the next full/incremental sync. One fetch per
  # distinct new gear id, not per ride -- GearSync#sync_gear's own rescue
  # already skips silently on failure (including a 429), so this can't fail
  # the ride refresh it's called after.
  module UncachedGear
    def self.call(user, gear_ids)
      gear_ids = gear_ids.compact.uniq
      return if gear_ids.empty?

      cached = user.strava_gears.where(strava_gear_id: gear_ids).pluck(:strava_gear_id)
      missing = gear_ids - cached
      return if missing.empty?

      gear_sync = Strava::GearSync.new(user)
      missing.each { |gear_id| gear_sync.sync_gear(gear_id) }
    end
  end
end
