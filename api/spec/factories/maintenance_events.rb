FactoryBot.define do
  factory :maintenance_event do
    component
    service_type
    performed_at { Time.zone.local(2026, 1, 1, 12, 0) }
    notes { "" }
  end
end
