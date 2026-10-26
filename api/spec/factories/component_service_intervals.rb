FactoryBot.define do
  factory :component_service_interval do
    component
    service_type
    distance_interval_meters { 300_000 }
    enabled { true }
  end
end
