FactoryBot.define do
  factory :notification_setting do
    user
    notifications_enabled { true }
    warning_threshold_percent { 5 }
  end
end
