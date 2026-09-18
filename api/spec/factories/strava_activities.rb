FactoryBot.define do
  factory :strava_activity do
    sequence(:strava_id) { |n| n }
    bike
    distance_meters { 10_000 }
    moved_on { Date.new(2026, 1, 1) }
    name { "Morning Ride" }
    activity_type { "Ride" }
  end
end
