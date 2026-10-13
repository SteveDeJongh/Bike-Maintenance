FactoryBot.define do
  factory :bike do
    user
    sequence(:name) { |n| "Bike #{n}" }
    make { "Cervelo" }
    model { "Soloist" }
  end
end
