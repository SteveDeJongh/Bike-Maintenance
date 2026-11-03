class ComponentServiceInterval < ApplicationRecord
  belongs_to :component
  belongs_to :category_service_interval, optional: true # nil = custom, not linked to a template
  belongs_to :service_type
  has_many :service_alert_dismissals, dependent: :destroy

  validates :service_type_id, uniqueness: { scope: :component_id }
  validate :at_least_one_interval_set_or_linked
  validate :component_and_service_type_have_same_owner
  validate :component_and_category_service_interval_have_same_owner

  # Callers always go through these -- never resolve template inheritance
  # themselves. nil on this row means "use the template's value" for a
  # linked row; a custom row (no template) has no fallback.
  def effective_distance_interval_meters
    distance_interval_meters || category_service_interval&.distance_interval_meters
  end

  def effective_time_interval_days
    time_interval_days || category_service_interval&.time_interval_days
  end

  private

  def at_least_one_interval_set_or_linked
    return if category_service_interval_id.present?
    return if distance_interval_meters.present? || time_interval_days.present?

    errors.add(:base, "Must set a distance interval, a time interval, or both")
  end

  def component_and_service_type_have_same_owner
    return if component.blank? || service_type.blank?

    errors.add(:base, "Component and service type must belong to the same user") if component.user_id != service_type.user_id
  end

  def component_and_category_service_interval_have_same_owner
    return if component.blank? || category_service_interval.blank?

    if component.user_id != category_service_interval.user_id
      errors.add(:base, "Component and category service interval must belong to the same user")
    end
  end
end
