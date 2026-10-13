FactoryBot.define do
  factory :component_assignment do
    bike
    component { bike ? association(:component, user: bike.user) : association(:component) }
    started_at { Time.zone.local(2026, 1, 1, 8, 0) }
    ended_at { nil }
  end
end
