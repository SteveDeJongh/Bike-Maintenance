# Transient distance_interval_meters/time_interval_days/service_type
# preserve the pre-rename call shape (create(:category_service_interval,
# service_type:, distance_interval_meters:)) across every existing spec --
# only the factory's own name changed. New-style calls can still pass
# distance_meters/calendar_amount/calendar_unit/name directly; an explicit
# value always wins over the transient-derived one below.
FactoryBot.define do
  factory :category_service_requirement do
    user
    category { "chain" }
    sequence(:name) { |n| "Service requirement #{n}" }

    transient do
      service_type { nil }
      distance_interval_meters { 300_000 }
      time_interval_days { nil }
    end

    distance_meters { distance_interval_meters }
    calendar_amount { time_interval_days }
    calendar_unit { time_interval_days.present? ? "day" : nil }

    after(:create) do |requirement, evaluator|
      next if requirement.satisfiers.any?

      service_type = evaluator.service_type || create(:service_type, user: requirement.user)
      create(:service_requirement_satisfier, owner: requirement, service_type: service_type, position: 1)
    end
  end
end
