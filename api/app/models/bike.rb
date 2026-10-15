class Bike < ApplicationRecord
  belongs_to :user
  has_many :component_assignments, dependent: :destroy
  has_many :components, through: :component_assignments
  has_many :strava_activities, dependent: :nullify

  validates :name, presence: true

  after_save :reconcile_strava_activities, if: :saved_change_to_strava_gear_id?

  private

  def reconcile_strava_activities
    StravaActivity.reconcile_for_bike!(self)
  end
end
