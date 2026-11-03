class CategoryServiceInterval < ApplicationRecord
  belongs_to :user
  belongs_to :service_type
  has_many :component_service_intervals, dependent: :destroy

  validates :category, presence: true
  validates :service_type_id, uniqueness: { scope: [ :user_id, :category ] }
  validate :at_least_one_interval_set
  validate :service_type_has_same_owner

  private

  def at_least_one_interval_set
    return if distance_interval_meters.present? || time_interval_days.present?

    errors.add(:base, "Must set a distance interval, a time interval, or both")
  end

  def service_type_has_same_owner
    return if service_type.blank?

    errors.add(:base, "Service type must belong to the same user") if service_type.user_id != user_id
  end
end
