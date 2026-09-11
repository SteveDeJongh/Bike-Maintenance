class MaintenanceEvent < ApplicationRecord
  EVENT_TYPES = %w[wax clean replace inspect].freeze

  belongs_to :component

  validates :event_type, presence: true, inclusion: { in: EVENT_TYPES }
  validates :performed_on, presence: true
end
