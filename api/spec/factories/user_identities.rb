FactoryBot.define do
  factory :user_identity do
    user
    provider { "google" }
    sequence(:uid) { |n| "uid-#{n}" }
    email { nil }
    email_verified { false }
  end
end
