FactoryBot.define do
  factory :component_category_setting do
    user
    category { "chain" }
    default_ride_context { "both" }
    trackable { true }
    allows_multiple_assignments { false }
  end
end
