class StravaActivity < ApplicationRecord
  belongs_to :bike, optional: true

  validates :strava_id, presence: true, uniqueness: true
  validates :distance_meters, presence: true
  validates :moved_on, presence: true
end
