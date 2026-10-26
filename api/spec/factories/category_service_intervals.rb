FactoryBot.define do
  factory :category_service_interval do
    user
    category { "chain" }
    service_type
    distance_interval_meters { 300_000 }
  end
end
