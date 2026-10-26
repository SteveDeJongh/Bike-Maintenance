class ServiceAlertDismissal < ApplicationRecord
  belongs_to :component_service_interval

  validates :dismissed_at, presence: true
  validates :dismissed_status, presence: true, inclusion: { in: %w[warning due] }
end
