FactoryBot.define do
  factory :strava_credential do
    user
    access_token { "access-token" }
    refresh_token { "refresh-token" }
    athlete_id { 123 }
    expires_at { 6.hours.from_now }
    scope { "activity:read_all" }
  end
end
