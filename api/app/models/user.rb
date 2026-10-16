class User < ApplicationRecord
  has_many :bikes, dependent: :destroy
  has_many :components, dependent: :destroy
  has_many :component_assignments, through: :bikes
  has_many :bike_component_slots, through: :bikes
  has_many :maintenance_events, through: :components
  has_many :strava_activities, dependent: :destroy
  has_many :strava_gears, dependent: :destroy
  has_one :strava_credential, dependent: :destroy

  validates :name, :email, presence: true
  validates :email, uniqueness: true
  validate :bike_list_preferences_is_a_hash

  private

  # Column keys and sort values are intentionally not enforced here, matching
  # how Component#category has no backend allow-list either — the frontend's
  # BIKE_LIST_COLUMNS constant is the sole source of truth for valid keys.
  def bike_list_preferences_is_a_hash
    errors.add(:bike_list_preferences, "must be a JSON object") unless bike_list_preferences.is_a?(Hash)
  end
end
