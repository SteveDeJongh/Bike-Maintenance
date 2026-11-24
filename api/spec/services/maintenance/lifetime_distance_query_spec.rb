require "rails_helper"

RSpec.describe Maintenance::LifetimeDistanceQuery do
  let(:user) { create(:user) }
  let(:road) { create(:bike, user: user) }
  let(:trainer_bike) { create(:bike, user: user) }

  def ride(bike, at, meters, trainer: false, type: "Ride")
    create(:strava_activity, user: user, bike: bike, moved_at: at, distance_meters: meters, trainer: trainer, activity_type: type)
  end

  it "matches Component#total_distance across windows, swaps and ride contexts" do
    chain = create(:component, user: user, category: "chain")
    cassette = create(:component, user: user, category: "cassette")
    unused = create(:component, user: user, category: "saddle")

    # Chain: two windows on the road bike, half-open at the swap instant.
    swap = Time.zone.local(2026, 3, 1, 12)
    create(:component_assignment, component: chain, bike: road, started_at: Time.zone.local(2026, 1, 1), ended_at: swap)
    create(:component_assignment, component: chain, bike: trainer_bike, started_at: swap, ended_at: nil)
    # Cassette: outdoor rides only on the road bike.
    create(:component_assignment, component: cassette, bike: road, started_at: Time.zone.local(2026, 1, 1), ride_context: "outdoor_only")

    ride(road, Time.zone.local(2026, 2, 1), 10_000)
    ride(road, swap, 7_000) # the swap instant belongs to the new window, not the road bike's
    ride(road, Time.zone.local(2026, 2, 2), 4_000, trainer: true) # indoor: not the outdoor-only cassette's
    ride(road, Time.zone.local(2026, 2, 3), 3_000, type: "VirtualRide") # indoor by type
    ride(trainer_bike, Time.zone.local(2026, 4, 1), 20_000)
    ride(trainer_bike, Time.zone.local(2025, 12, 1), 99_000) # before any window

    result = described_class.call(user, component_ids: [ chain.id, cassette.id, unused.id ])

    [ chain, cassette, unused ].each do |component|
      expect(result[component.id]).to eq(component.total_distance), "parity for #{component.category}"
    end
    expect(result[unused.id]).to eq(0)
  end

  it "ignores another user's components" do
    other = create(:component)

    expect(described_class.call(user, component_ids: [ other.id ])).to eq({})
  end

  it "returns an empty hash for no ids" do
    expect(described_class.call(user, component_ids: [])).to eq({})
  end
end
