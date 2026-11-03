FactoryBot.define do
  factory :maintenance_event do
    component
    service_type { component ? association(:service_type, user: component.user) : association(:service_type) }
    performed_at { Time.zone.local(2026, 1, 1, 12, 0) }
    notes { "" }
  end
end
