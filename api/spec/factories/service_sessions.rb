FactoryBot.define do
  factory :service_session do
    bike
    user { bike.user }
    performed_at { Time.zone.local(2026, 1, 1, 12, 0) }
  end
end
