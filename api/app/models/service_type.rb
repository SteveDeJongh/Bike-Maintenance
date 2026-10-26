class ServiceType < ApplicationRecord
  belongs_to :user
  has_many :maintenance_events, dependent: :restrict_with_error
  has_many :category_service_intervals, dependent: :restrict_with_error
  has_many :component_service_intervals, dependent: :restrict_with_error

  validates :name, presence: true, uniqueness: { scope: :user_id, case_sensitive: false }
end
