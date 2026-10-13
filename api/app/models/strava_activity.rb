class StravaActivity < ApplicationRecord
  belongs_to :user
  belongs_to :bike, optional: true

  validates :strava_id, presence: true, uniqueness: true
  validates :distance_meters, presence: true
  validates :moved_at, presence: true

  # Backfills bike_id onto activities synced before the user mapped this
  # bike's gear, or re-mapped it since. gear_id (Strava's raw identifier)
  # is stored separately from bike_id (the resolved local FK) specifically
  # so this reconciliation is possible after the fact.
  def self.reconcile_for_bike!(bike)
    return if bike.strava_gear_id.blank?

    where(user_id: bike.user_id, gear_id: bike.strava_gear_id).update_all(bike_id: bike.id)
  end
end
