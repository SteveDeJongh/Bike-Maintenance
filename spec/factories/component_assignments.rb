FactoryBot.define do
  factory :component_assignment do
    component
    bike
    started_on { Date.new(2026, 1, 1) }
    ended_on { nil }
  end
end
