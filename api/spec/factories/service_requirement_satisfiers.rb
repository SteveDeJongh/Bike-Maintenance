FactoryBot.define do
  factory :service_requirement_satisfier do
    association :owner, factory: :category_service_requirement
    # Same user as the owner by default -- service_type_has_same_owner
    # would otherwise fail, since :service_type and :category_service_requirement
    # each default to a fresh, unrelated user on their own.
    service_type { association(:service_type, user: owner.is_a?(CategoryServiceRequirement) ? owner.user : owner.component.user) }
    position { 1 }

    allowance_distance_meters { nil }
    allowance_moving_time_seconds { nil }
    allowance_calendar_amount { nil }
    allowance_calendar_unit { nil }
  end
end
