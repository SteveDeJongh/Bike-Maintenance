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

  describe "session-bound performed_at" do
    it "allows setting performed_at on create, even when service_session_id is set" do
      session = create(:service_session)
      event = build(:maintenance_event, component: create(:component, user: session.user),
        service_type: create(:service_type, user: session.user),
        service_session: session, performed_at: session.performed_at)

      expect(event).to be_valid
    end

    it "rejects editing performed_at directly on an already-persisted session-bound event" do
      session = create(:service_session)
      event = create(:maintenance_event, component: create(:component, user: session.user),
        service_type: create(:service_type, user: session.user),
        service_session: session, performed_at: session.performed_at)

      event.performed_at = session.performed_at + 1.day

      expect(event).not_to be_valid
      expect(event.errors[:performed_at]).to include(a_string_matching(/service session/))
    end

    it "allows editing other fields on a session-bound event without touching performed_at" do
      session = create(:service_session)
      event = create(:maintenance_event, component: create(:component, user: session.user),
        service_type: create(:service_type, user: session.user),
        service_session: session, performed_at: session.performed_at)

      event.notes = "updated"

      expect(event).to be_valid
    end
  end

  describe "deleting the last event in a session" do
    it "deletes the session when its only event is destroyed" do
      session = create(:service_session)
      event = create(:maintenance_event, component: create(:component, user: session.user),
        service_type: create(:service_type, user: session.user),
        service_session: session, performed_at: session.performed_at)

      event.destroy!

      expect(ServiceSession.exists?(session.id)).to be false
    end

    it "leaves the session alone when other events remain" do
      session = create(:service_session)
      component = create(:component, user: session.user)
      service_type = create(:service_type, user: session.user)
      event_a = create(:maintenance_event, component: component, service_type: service_type,
        service_session: session, performed_at: session.performed_at)
      create(:maintenance_event, component: create(:component, user: session.user), service_type: service_type,
        service_session: session, performed_at: session.performed_at)

      event_a.destroy!

      expect(ServiceSession.exists?(session.id)).to be true
    end
  end
end
