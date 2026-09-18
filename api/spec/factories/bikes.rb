FactoryBot.define do
  factory :bike do
    sequence(:name) { |n| "Bike #{n}" }
    make { "Cervelo" }
    model { "Soloist" }
  end
end
