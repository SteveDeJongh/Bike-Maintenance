FactoryBot.define do
  factory :bike_component_slot do
    bike
    category { "chain" }
    ride_context { "both" }
  end
end
