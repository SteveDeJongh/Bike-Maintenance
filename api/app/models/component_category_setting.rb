class ComponentCategorySetting < ApplicationRecord
  belongs_to :user

  validates :category, presence: true, uniqueness: { scope: :user_id }
  validates :default_ride_context, inclusion: { in: %w[both outdoor_only indoor_only] }
  validates :warning_threshold_percent, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 100 },
    allow_nil: true
end
