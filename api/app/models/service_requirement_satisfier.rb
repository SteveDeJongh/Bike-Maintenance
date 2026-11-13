class ServiceRequirementSatisfier < ApplicationRecord
  belongs_to :owner, polymorphic: true
  belongs_to :service_type

  # allowance column => the owner's own raw threshold column it can only be
  # set alongside (calendar is checked separately below, since its
  # allowance is a amount+unit pair, not a single column).
  DIMENSION_ALLOWANCE_COLUMNS = {
    "allowance_distance_meters" => "distance_meters",
    "allowance_moving_time_seconds" => "moving_time_seconds",
  }.freeze

  validates :position, presence: true
  validates :service_type_id, uniqueness: { scope: [ :owner_type, :owner_id ] }
  validate :owner_is_a_template_or_unlinked_component_requirement
  validate :service_type_has_same_owner
  validate :allowances_match_owner_thresholds
  before_destroy :ensure_not_last_satisfier

  private

  # Satisfiers only ever live on a CategoryServiceRequirement (a template)
  # or an unlinked (custom) ComponentServiceRequirement -- a linked row
  # always uses its template's satisfiers, never its own.
  def owner_is_a_template_or_unlinked_component_requirement
    return if owner.is_a?(CategoryServiceRequirement)
    return if owner.is_a?(ComponentServiceRequirement) && !owner.linked?

    errors.add(:base, "Linked requirements use their template's satisfiers -- edit the category default instead")
  end

  def owner_user_id
    owner.is_a?(CategoryServiceRequirement) ? owner.user_id : owner.component.user_id
  end

  def service_type_has_same_owner
    return if owner.blank? || service_type.blank?

    errors.add(:base, "Service type must belong to the same user") if service_type.user_id != owner_user_id
  end

  # A satisfier can't set an allowance on a dimension the requirement
  # itself doesn't have -- checked against the owner's own raw columns
  # (never "effective"): satisfiers only ever live on a template or an
  # unlinked row, neither of which has anything to inherit.
  def allowances_match_owner_thresholds
    return if owner.blank?

    DIMENSION_ALLOWANCE_COLUMNS.each do |allowance_column, threshold_column|
      next if self[allowance_column].blank?
      next if owner.public_send(threshold_column).present?

      errors.add(allowance_column, "can't be set -- the requirement has no #{threshold_column.to_s.humanize.downcase} threshold")
    end

    if (allowance_calendar_amount.present? || allowance_calendar_unit.present?) && owner.calendar_amount.blank?
      errors.add(:allowance_calendar_amount, "can't be set -- the requirement has no calendar threshold")
    end
  end

  def ensure_not_last_satisfier
    return unless owner.satisfiers.count <= 1

    errors.add(:base, "Can't remove the last satisfier -- a requirement needs at least one")
    throw :abort
  end
end
