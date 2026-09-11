require "rails_helper"

RSpec.describe MaintenanceEvent, type: :model do
  it "is valid with a component, event_type, and performed_on" do
    expect(build(:maintenance_event)).to be_valid
  end

  it "is invalid without an event_type" do
    event = build(:maintenance_event, event_type: nil)

    expect(event).not_to be_valid
    expect(event.errors[:event_type]).to be_present
  end

  it "is invalid with an event_type outside the allowed list" do
    event = build(:maintenance_event, event_type: "polish")

    expect(event).not_to be_valid
    expect(event.errors[:event_type]).to be_present
  end

  it "is invalid without performed_on" do
    event = build(:maintenance_event, performed_on: nil)

    expect(event).not_to be_valid
    expect(event.errors[:performed_on]).to be_present
  end

  it "is invalid without a component" do
    event = build(:maintenance_event, component: nil)

    expect(event).not_to be_valid
    expect(event.errors[:component]).to be_present
  end
end
