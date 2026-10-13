FactoryBot.define do
  factory :component do
    user
    sequence(:label) { |n| "Chain #{n}" }
    category { "chain" }
    acquired_on { Date.new(2026, 1, 1) }
  end
end
