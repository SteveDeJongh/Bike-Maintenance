FactoryBot.define do
  factory :strava_gear do
    user
    sequence(:strava_gear_id) { |n| "b#{n}" }
    name { "My Bike" }
    brand_name { "Specialized" }
    model { "Diverge" }
    retired { false }
    distance_meters { 100_000 }
    synced_at { Time.current }
  end
end
