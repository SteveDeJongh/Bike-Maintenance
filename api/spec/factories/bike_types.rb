FactoryBot.define do
  factory :bike_type do
    user
    sequence(:name) { |n| "Bike Type #{n}" }
    default_categories { [] }
  end
end
