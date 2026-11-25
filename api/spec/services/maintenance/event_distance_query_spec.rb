require "rails_helper"

RSpec.describe Maintenance::EventDistanceQuery do
  let(:user) { create(:user) }
  let(:bike) { create(:bike, user: user) }

  it "sums attributed rides strictly before each event, and ignores another user's events" do
    chain = create(:component, user: user)
    create(:component_assignment, component: chain, bike: bike, started_at: Time.zone.local(2026, 1, 1))
    create(:strava_activity, user: user, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: 10_000)
    at_ride = Time.zone.local(2026, 1, 10)
    create(:strava_activity, user: user, bike: bike, moved_at: at_ride, distance_meters: 4_000)
    early = create(:maintenance_event, component: chain, performed_at: Time.zone.local(2026, 1, 2))
    same_instant = create(:maintenance_event, component: chain, performed_at: at_ride)
    theirs = create(:maintenance_event)

    result = described_class.call(user, event_ids: [ early.id, same_instant.id, theirs.id ])

    expect(result).to eq(early.id => 0, same_instant.id => 10_000)
  end
end
