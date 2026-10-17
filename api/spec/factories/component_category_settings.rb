FactoryBot.define do
  factory :component_category_setting do
    user
    category { "chain" }
    accrues_indoor_mileage { true }
  end
end
