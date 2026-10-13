class ComponentAssignment < ApplicationRecord
  belongs_to :component
  belongs_to :bike

  validates :started_at, presence: true
  validate :ended_at_after_started_at
  validate :no_overlapping_assignment_for_component
  validate :no_overlapping_assignment_for_bike_slot
  validate :component_and_bike_have_same_owner

  private

  def component_and_bike_have_same_owner
    return if component.blank? || bike.blank?

    errors.add(:base, "Component and bike must belong to the same user") if component.user_id != bike.user_id
  end

  def ended_at_after_started_at
    return if started_at.blank? || ended_at.blank?

    errors.add(:ended_at, "must be at or after started_at") if ended_at < started_at
  end

  def no_overlapping_assignment_for_component
    return if component_id.blank? || started_at.blank?

    conflicts = ComponentAssignment.where(component_id: component_id).where.not(id: id)
    if conflicts.any? { |other| overlaps?(other) }
      errors.add(:base, "This component is already assigned to a bike during that period")
    end
  end

  def no_overlapping_assignment_for_bike_slot
    return if bike_id.blank? || started_at.blank? || component.blank?

    conflicts = ComponentAssignment
      .joins(:component)
      .where(bike_id: bike_id, components: { category: component.category })
      .where.not(id: id)

    if conflicts.any? { |other| overlaps?(other) }
      errors.add(:base, "This bike already has a #{component.category} assigned during that period")
    end
  end

  # Two [started_at, ended_at] ranges overlap unless one entirely precedes
  # the other. A nil ended_at means the assignment is still ongoing.
  def overlaps?(other)
    return false if ended_at.present? && other.started_at > ended_at
    return false if other.ended_at.present? && started_at > other.ended_at

    true
  end
end
