class StravaGear < ApplicationRecord
  belongs_to :user

  validates :strava_gear_id, presence: true, uniqueness: { scope: :user_id }
  validate :not_ignored_while_mapped

  scope :ignored, -> { where.not(ignored_at: nil) }
  scope :not_ignored, -> { where(ignored_at: nil) }

  # Whether this gear has had an activity since it was ignored -- a bike
  # that gets un-retired on Strava after being "don't tracked" here should
  # stop being treated as ignored for display/counting, without ever
  # auto-clearing ignored_at itself (re-ignoring sets it to now again).
  RESURFACED_CONDITION = <<~SQL.squish
    EXISTS (
      SELECT 1 FROM strava_activities sa
      WHERE sa.user_id = strava_gears.user_id
        AND sa.gear_id = strava_gears.strava_gear_id
        AND sa.moved_at > strava_gears.ignored_at
    )
  SQL

  # Cached Strava-side gear (populated by Strava::GearSync) that isn't
  # claimed by any of the user's bikes yet, and isn't ignored (or has
  # resurfaced) -- the source StravaController's /strava/unmapped_gear and
  # the dashboard's unattributed-rides count both read from, so they can
  # never show different numbers for the same thing.
  def self.unmapped_for(user)
    mapped_ids = user.bikes.where.not(strava_gear_id: [nil, ""]).pluck(:strava_gear_id)
    user.strava_gears.where.not(strava_gear_id: mapped_ids)
      .where("ignored_at IS NULL OR #{RESURFACED_CONDITION}")
  end

  # Ignored gear that hasn't resurfaced -- the "Ignored gear" section's
  # source. Excluding mapped gear here too is defensive (the validation
  # below should make an ignored+mapped row unreachable), kept for symmetry
  # with unmapped_for.
  def self.ignored_for(user)
    mapped_ids = user.bikes.where.not(strava_gear_id: [nil, ""]).pluck(:strava_gear_id)
    user.strava_gears.ignored.where.not(strava_gear_id: mapped_ids).where.not(RESURFACED_CONDITION)
  end

  private

  # A gear is never both mapped and ignored -- mapping clears ignored_at
  # (see Bike#reconcile_strava_activities), and this is the backstop that
  # keeps "ignore" itself from being set on gear that's currently mapped.
  def not_ignored_while_mapped
    return if ignored_at.blank?

    if user.bikes.exists?(strava_gear_id: strava_gear_id)
      errors.add(:ignored_at, "cannot be set while this gear is mapped to a bike")
    end
  end
end
