class User < ApplicationRecord
  has_many :bikes, dependent: :destroy
  has_many :components, dependent: :destroy
  has_many :component_assignments, through: :bikes
  has_many :bike_component_slots, through: :bikes
  has_many :maintenance_events, through: :components
  has_many :strava_activities, dependent: :destroy
  has_many :strava_gears, dependent: :destroy
  has_one :strava_credential, dependent: :destroy
  has_many :table_view_preferences, dependent: :destroy

  validates :name, :email, presence: true
  validates :email, uniqueness: true
end
