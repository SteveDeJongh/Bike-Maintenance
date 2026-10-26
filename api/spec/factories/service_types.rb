FactoryBot.define do
  factory :service_type do
    user
    sequence(:name) { |n| "Service Type #{n}" }
  end
end
