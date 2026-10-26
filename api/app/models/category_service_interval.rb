class CategoryServiceInterval < ApplicationRecord
  belongs_to :user
  belongs_to :service_type
  has_many :component_service_intervals, dependent: :destroy

  validates :category, presence: true
  validates :service_type_id, uniqueness: { scope: [ :user_id, :category ] }
  validate :at_least_one_interval_set

  private

  def at_least_one_interval_set
    return if distance_interval_meters.present? || time_interval_days.present?

    errors.add(:base, "Must set a distance interval, a time interval, or both")
  end
end
