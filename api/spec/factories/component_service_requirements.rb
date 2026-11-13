# Same backward-compatible shape as category_service_requirements.rb's
# factory -- transient distance_interval_meters/time_interval_days/
# service_type preserve the pre-rename call shape. Defaults to a custom
# (unlinked) row; pass category_service_requirement: template for a linked
# one (whose name/thresholds are nil -- it inherits from the template, same
# as the real model requires).
FactoryBot.define do
  factory :component_service_requirement do
    component
    enabled { true }
    category_service_requirement { nil }

    transient do
      service_type { nil }
      distance_interval_meters { 300_000 }
      time_interval_days { nil }
    end

    sequence(:name) { |n| category_service_requirement.nil? ? "Custom requirement #{n}" : nil }
    distance_meters { category_service_requirement.nil? ? distance_interval_meters : nil }
    calendar_amount { category_service_requirement.nil? ? time_interval_days : nil }
    calendar_unit { category_service_requirement.nil? && time_interval_days.present? ? "day" : nil }

    after(:create) do |requirement, evaluator|
      next if requirement.linked?
      next if requirement.satisfiers.any?

      service_type = evaluator.service_type || create(:service_type, user: requirement.component.user)
      create(:service_requirement_satisfier, owner: requirement, service_type: service_type, position: 1)
    end
  end
end
