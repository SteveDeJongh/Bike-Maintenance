require "rails_helper"

RSpec.describe ServiceSession, type: :model do
  it "is valid with a user, bike, and performed_at" do
    expect(build(:service_session)).to be_valid
  end

  it "is invalid without performed_at" do
    session = build(:service_session, performed_at: nil)

    expect(session).not_to be_valid
    expect(session.errors[:performed_at]).to be_present
  end

  it "is invalid when the bike belongs to a different user" do
    session = build(:service_session, user: create(:user), bike: create(:bike))

    expect(session).not_to be_valid
    expect(session.errors[:base]).to include(a_string_matching(/same user/))
  end

  it "is invalid with a performed_at beyond the future tolerance" do
    session = build(:service_session, performed_at: ServiceSession::FUTURE_TOLERANCE.from_now + 1.minute)

    expect(session).not_to be_valid
    expect(session.errors[:performed_at]).to include(a_string_matching(/future/))
  end

  it "is valid with a performed_at within the future tolerance" do
    session = build(:service_session, performed_at: 1.minute.from_now)

    expect(session).to be_valid
  end

  describe "#sync_event_performed_at" do
    it "moves every event's performed_at in step when the session's own date changes" do
      session = create(:service_session, performed_at: Time.zone.local(2026, 1, 1, 12, 0))
      component = create(:component, user: session.user)
      service_type = create(:service_type, user: session.user)
      event_a = create(:maintenance_event, component: component, service_type: service_type,
        service_session: session, performed_at: session.performed_at)
      event_b = create(:maintenance_event, component: component, service_type: create(:service_type, user: session.user),
        service_session: session, performed_at: session.performed_at)

      new_time = Time.zone.local(2026, 1, 2, 9, 0)
      session.update!(performed_at: new_time)

      expect(event_a.reload.performed_at).to eq(new_time)
      expect(event_b.reload.performed_at).to eq(new_time)
    end

    it "does not touch events when a session update leaves performed_at unchanged" do
      session = create(:service_session, performed_at: Time.zone.local(2026, 1, 1, 12, 0))
      event = create(:maintenance_event, component: create(:component, user: session.user),
        service_type: create(:service_type, user: session.user),
        service_session: session, performed_at: session.performed_at)
      original_updated_at = event.updated_at

      session.update!(notes: "new note")

      expect(event.reload.updated_at).to be_within(1.second).of(original_updated_at)
    end
  end

  describe "deleting a session" do
    it "deletes its events too" do
      session = create(:service_session)
      event = create(:maintenance_event, component: create(:component, user: session.user),
        service_type: create(:service_type, user: session.user),
        service_session: session, performed_at: session.performed_at)

      session.destroy!

      expect(MaintenanceEvent.exists?(event.id)).to be false
    end
  end
end
