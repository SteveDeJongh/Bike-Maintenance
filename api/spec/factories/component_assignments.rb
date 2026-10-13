FactoryBot.define do
  factory :component_assignment do
    component
    bike
    started_at { Time.zone.local(2026, 1, 1, 8, 0) }
    ended_at { nil }
  end
end
