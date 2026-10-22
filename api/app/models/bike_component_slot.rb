class BikeComponentSlot < ApplicationRecord
  belongs_to :bike

  validates :category, presence: true, uniqueness: { scope: [ :bike_id, :ride_context ] }
  validates :ride_context, inclusion: { in: %w[both outdoor_only indoor_only] }
  validate :ride_context_requires_allows_multiple_assignments

  before_destroy :ensure_not_occupied

  private

  # A split (non-"both") slot is only a meaningful concept for a category
  # the user has explicitly marked as allowed to have more than one active
  # installation at once -- same setting that governs the overlap
  # relaxations on ComponentAssignment. Keeps "the indoor cassette slot"
  # from existing for a category that was never meant to be split.
  def ride_context_requires_allows_multiple_assignments
    return if ride_context == "both" || bike.blank? || category.blank?

    allowed = ComponentCategorySetting.find_by(user_id: bike.user_id, category: category)&.allows_multiple_assignments
    errors.add(:ride_context, "can only be restricted for a category that allows multiple assignments") unless allowed
  end

  # A "both" slot is the only slot for its category, so any active
  # assignment of that category belongs to it. A split slot only owns
  # assignments that actually match its own ride_context -- removing the
  # indoor assignment and stopping tracking the indoor slot never gets
  # blocked by an unrelated, still-active outdoor slot.
  def ensure_not_occupied
    scope = ComponentAssignment.joins(:component).where(bike_id: bike_id, components: { category: category }, ended_at: nil)
    scope = scope.where(ride_context: ride_context) unless ride_context == "both"

    if scope.exists?
      errors.add(:base, "Cannot stop tracking #{category} while a component is still assigned")
      throw :abort
    end
  end
end
