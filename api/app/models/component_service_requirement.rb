class ComponentServiceRequirement < ApplicationRecord
  belongs_to :component
  belongs_to :category_service_requirement, optional: true # nil = custom, not linked to a template
  # delete_all, not destroy -- see CategoryServiceRequirement's own
  # association for why (a custom row's lone satisfier must not block the
  # row itself from being destroyed).
  has_many :satisfiers, as: :owner, class_name: "ServiceRequirementSatisfier", dependent: :delete_all
  has_many :service_alert_dismissals, dependent: :destroy

  validates :ride_filter, inclusion: { in: CategoryServiceRequirement::RIDE_FILTERS }, allow_nil: true
  validates :calendar_unit, inclusion: { in: CategoryServiceRequirement::CALENDAR_UNITS }, allow_nil: true
  validate :name_matches_linked_state
  validate :at_least_one_threshold_set_or_linked
  validate :calendar_amount_and_unit_together
  validate :component_and_category_service_requirement_have_same_owner

  def linked?
    category_service_requirement_id.present?
  end

  def effective_name
    linked? ? category_service_requirement.name : name
  end

  def effective_distance_meters
    distance_meters || (linked? ? category_service_requirement.distance_meters : nil)
  end

  def effective_moving_time_seconds
    moving_time_seconds || (linked? ? category_service_requirement.moving_time_seconds : nil)
  end

  def effective_calendar_amount
    calendar_amount || (linked? ? category_service_requirement.calendar_amount : nil)
  end

  def effective_calendar_unit
    calendar_unit || (linked? ? category_service_requirement.calendar_unit : nil)
  end

  def effective_ride_filter
    ride_filter || (linked? ? category_service_requirement.ride_filter : "all")
  end

  # The owner whose satisfiers actually apply -- a linked row's satisfiers
  # always live on its template, never on itself.
  def satisfier_owner
    linked? ? category_service_requirement : self
  end

  # Each allowance already resolved (nil -> this requirement's own
  # effective threshold for that dimension) -- callers never chase
  # template inheritance or allowance fallback themselves.
  def effective_satisfiers
    satisfier_owner.satisfiers.order(:position).map do |satisfier|
      {
        id: satisfier.id,
        service_type_id: satisfier.service_type_id,
        service_type_name: satisfier.service_type.name,
        position: satisfier.position,
        allowance_distance_meters: satisfier.allowance_distance_meters || effective_distance_meters,
        allowance_moving_time_seconds: satisfier.allowance_moving_time_seconds || effective_moving_time_seconds,
        allowance_calendar_amount: satisfier.allowance_calendar_amount || effective_calendar_amount,
        allowance_calendar_unit: satisfier.allowance_calendar_unit || effective_calendar_unit,
      }
    end
  end

  # The one effective-values method -- every caller (status computation,
  # serializers) goes through this instead of resolving inheritance itself.
  def effective
    {
      name: effective_name,
      distance_meters: effective_distance_meters,
      moving_time_seconds: effective_moving_time_seconds,
      calendar_amount: effective_calendar_amount,
      calendar_unit: effective_calendar_unit,
      ride_filter: effective_ride_filter,
      satisfiers: effective_satisfiers,
    }
  end

  private

  def name_matches_linked_state
    if linked?
      errors.add(:name, "can't be set on a linked requirement -- it always uses the template's name") if name.present?
    else
      errors.add(:name, "can't be blank") if name.blank?
    end
  end

  def at_least_one_threshold_set_or_linked
    return if linked?
    return if distance_meters.present? || moving_time_seconds.present? || calendar_amount.present?

    errors.add(:base, "Must set a distance, moving time, or calendar threshold")
  end

  def calendar_amount_and_unit_together
    return if calendar_amount.present? == calendar_unit.present?

    errors.add(:base, "Calendar amount and unit must be set together")
  end

  def component_and_category_service_requirement_have_same_owner
    return if component.blank? || category_service_requirement.blank?

    if component.user_id != category_service_requirement.user_id
      errors.add(:base, "Component and category service requirement must belong to the same user")
    end
  end
end
