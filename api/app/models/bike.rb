class Bike < ApplicationRecord
  belongs_to :user
  has_many :component_assignments, dependent: :destroy
  has_many :components, through: :component_assignments
  has_many :strava_activities, dependent: :nullify

  validates :name, presence: true

  after_save :reconcile_strava_activities, if: :saved_change_to_strava_gear_id?

  def total_distance
    strava_activities.sum(:distance_meters)
  end

  def total_moving_time
    strava_activities.sum(:moving_time)
  end

  def first_ride_on
    strava_activities.minimum(:moved_at)
  end

  private

  def reconcile_strava_activities
    old_gear_id, new_gear_id = saved_change_to_strava_gear_id
    if old_gear_id.present?
      StravaActivity.where(user_id: user_id, gear_id: old_gear_id, bike_id: id).update_all(bike_id: nil)
    end
    StravaActivity.reconcile_for_bike!(self) if new_gear_id.present?
  end
end
