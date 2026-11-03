require "rails_helper"

RSpec.describe MaintenanceEvent, type: :model do
  it "is valid with a component, service_type, and performed_at" do
    expect(build(:maintenance_event)).to be_valid
  end

  it "is invalid without a service_type" do
    event = build(:maintenance_event, service_type: nil)

    expect(event).not_to be_valid
    expect(event.errors[:service_type]).to be_present
  end

  it "is invalid without performed_at" do
    event = build(:maintenance_event, performed_at: nil)

    expect(event).not_to be_valid
    expect(event.errors[:performed_at]).to be_present
  end

  it "is invalid without a component" do
    event = build(:maintenance_event, component: nil)

    expect(event).not_to be_valid
    expect(event.errors[:component]).to be_present
  end

  it "is invalid when the component and service type belong to different users" do
    event = build(:maintenance_event, component: create(:component), service_type: create(:service_type))

    expect(event).not_to be_valid
    expect(event.errors[:base]).to include(a_string_matching(/same user/))
  end
end
