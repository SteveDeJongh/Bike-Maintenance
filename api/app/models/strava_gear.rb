class StravaGear < ApplicationRecord
  belongs_to :user

  validates :strava_gear_id, presence: true, uniqueness: { scope: :user_id }

  # Cached Strava-side gear (populated by Strava::GearSync) that isn't
  # claimed by any of the user's bikes yet -- the source StravaController's
  # /strava/unmapped_gear and the dashboard's unattributed-rides count both
  # read from, so they can never show different numbers for the same thing.
  def self.unmapped_for(user)
    mapped_ids = user.bikes.where.not(strava_gear_id: [nil, ""]).pluck(:strava_gear_id)
    user.strava_gears.where.not(strava_gear_id: mapped_ids)
  end
end
