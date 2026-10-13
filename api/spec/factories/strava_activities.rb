FactoryBot.define do
  factory :strava_activity do
    sequence(:strava_id) { |n| n }
    bike
    distance_meters { 10_000 }
    moved_at { Time.zone.local(2026, 1, 1, 12, 0) }
    name { "Morning Ride" }
    activity_type { "Ride" }
  end
end
