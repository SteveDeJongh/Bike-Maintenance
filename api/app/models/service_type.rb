class ServiceType < ApplicationRecord
  belongs_to :user
  has_many :maintenance_events, dependent: :restrict_with_error

  validates :name, presence: true, uniqueness: { scope: :user_id, case_sensitive: false }
end
