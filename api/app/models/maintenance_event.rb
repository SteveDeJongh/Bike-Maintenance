class MaintenanceEvent < ApplicationRecord
  belongs_to :component
  belongs_to :service_type

  validates :performed_at, presence: true
  validate :component_and_service_type_have_same_owner

  private

  def component_and_service_type_have_same_owner
    return if component.blank? || service_type.blank?

    errors.add(:base, "Component and service type must belong to the same user") if component.user_id != service_type.user_id
  end
end
