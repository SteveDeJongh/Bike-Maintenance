FactoryBot.define do
  factory :maintenance_event do
    component
    event_type { "wax" }
    performed_on { Date.new(2026, 1, 1) }
    notes { "" }
  end
end
