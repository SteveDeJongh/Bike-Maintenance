class ComponentCategorySetting < ApplicationRecord
  belongs_to :user

  validates :category, presence: true, uniqueness: { scope: :user_id }
  validates :default_ride_context, inclusion: { in: %w[both outdoor_only indoor_only] }
end
