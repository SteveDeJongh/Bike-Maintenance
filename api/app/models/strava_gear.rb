class StravaGear < ApplicationRecord
  belongs_to :user

  validates :strava_gear_id, presence: true, uniqueness: { scope: :user_id }
end
