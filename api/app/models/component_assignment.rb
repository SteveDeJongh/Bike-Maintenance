class ComponentAssignment < ApplicationRecord
  belongs_to :component
  belongs_to :bike

  validates :started_on, presence: true
  validate :ended_on_after_started_on
  validate :no_overlapping_assignment_for_component
  validate :no_overlapping_assignment_for_bike_slot

  private

  def ended_on_after_started_on
    return if started_on.blank? || ended_on.blank?

    errors.add(:ended_on, "must be on or after started_on") if ended_on < started_on
  end

  def no_overlapping_assignment_for_component
    return if component_id.blank? || started_on.blank?

    conflicts = ComponentAssignment.where(component_id: component_id).where.not(id: id)
    if conflicts.any? { |other| overlaps?(other) }
      errors.add(:base, "This component is already assigned to a bike during that period")
    end
  end

  def no_overlapping_assignment_for_bike_slot
    return if bike_id.blank? || started_on.blank? || component.blank?

    conflicts = ComponentAssignment
      .joins(:component)
      .where(bike_id: bike_id, components: { category: component.category })
      .where.not(id: id)

    if conflicts.any? { |other| overlaps?(other) }
      errors.add(:base, "This bike already has a #{component.category} assigned during that period")
    end
  end

  # Two [started_on, ended_on] ranges overlap unless one entirely precedes
  # the other. A nil ended_on means the assignment is still ongoing.
  def overlaps?(other)
    return false if ended_on.present? && other.started_on > ended_on
    return false if other.ended_on.present? && started_on > other.ended_on

    true
  end
end
