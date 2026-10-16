class BikeComponentSlot < ApplicationRecord
  belongs_to :bike

  validates :category, presence: true, uniqueness: { scope: :bike_id }

  before_destroy :ensure_not_occupied

  private

  def ensure_not_occupied
    occupied = ComponentAssignment
      .joins(:component)
      .where(bike_id: bike_id, components: { category: category }, ended_at: nil)
      .exists?

    if occupied
      errors.add(:base, "Cannot stop tracking #{category} while a component is still assigned")
      throw :abort
    end
  end
end
