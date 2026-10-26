require "rails_helper"

RSpec.describe ServiceAlertDismissal, type: :model do
  it "is valid with a component_service_interval, dismissed_at, and dismissed_status" do
    expect(build(:service_alert_dismissal)).to be_valid
  end

  it "is invalid without a dismissed_at" do
    dismissal = build(:service_alert_dismissal, dismissed_at: nil)

    expect(dismissal).not_to be_valid
    expect(dismissal.errors[:dismissed_at]).to be_present
  end

  it "is invalid with a dismissed_status outside the known set" do
    dismissal = build(:service_alert_dismissal, dismissed_status: "snoozed")

    expect(dismissal).not_to be_valid
    expect(dismissal.errors[:dismissed_status]).to be_present
  end

  it "is destroyed along with its component_service_interval" do
    interval = create(:component_service_interval)
    dismissal = create(:service_alert_dismissal, component_service_interval: interval)

    interval.destroy!

    expect(ServiceAlertDismissal.exists?(dismissal.id)).to be false
  end
end
