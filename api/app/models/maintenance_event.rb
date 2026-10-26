class MaintenanceEvent < ApplicationRecord
  belongs_to :component
  belongs_to :service_type

  validates :performed_at, presence: true
end
