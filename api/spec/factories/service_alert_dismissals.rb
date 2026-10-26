FactoryBot.define do
  factory :service_alert_dismissal do
    component_service_interval
    dismissed_at { Time.current }
    dismissed_status { "warning" }
  end
end
