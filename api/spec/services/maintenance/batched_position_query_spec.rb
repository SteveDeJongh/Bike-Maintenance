require "rails_helper"

RSpec.describe Maintenance::BatchedPositionQuery do
  def bundle_for(requirement, user)
    described_class.call(user)[requirement.id]
  end

  it "sums lifetime distance/moving_time at the 'now' checkpoint, filtered by ride_context and ride_filter" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain", acquired_on: Date.new(2026, 1, 1))
    create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1))
    wax = create(:service_type, user: bike.user)
    requirement = create(:component_service_requirement, component: component, name: "Lube",
      distance_meters: 300_000, moving_time_seconds: 100.hours.to_i, service_type: wax)

    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 5_000, moving_time: 1.hour.to_i)
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 2), distance_meters: 4_000, moving_time: 2.hours.to_i, trainer: true)

    bundle = bundle_for(requirement, bike.user)

    expect(bundle.positions[:now][:distance]).to eq(9_000)
    expect(bundle.positions[:now][:moving_time]).to eq(3.hours.to_i)
  end

  it "computes a position at every satisfying event, not just now" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain", acquired_on: Date.new(2026, 1, 1))
    create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1))
    wax = create(:service_type, user: bike.user)
    requirement = create(:component_service_requirement, component: component, name: "Lube",
      distance_meters: 300_000, service_type: wax)

    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 5_000)
    event = create(:maintenance_event, component: component, service_type: wax, performed_at: Time.zone.local(2026, 2, 10))
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 3, 1), distance_meters: 7_000)

    bundle = bundle_for(requirement, bike.user)

    expect(bundle.positions[event.id][:distance]).to eq(5_000)
    expect(bundle.positions[:now][:distance]).to eq(12_000)
    expect(bundle.events).to eq([ event ])
  end

  it "bounds the checkpoint set to the largest-allowance satisfier's own last occurrence and later" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain", acquired_on: Date.new(2026, 1, 1))
    create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1))
    hot_wax = create(:service_type, user: bike.user, name: "Hot Wax") # inherits 500km -- the largest allowance
    drip_wax = create(:service_type, user: bike.user, name: "Drip Wax")
    requirement = create(:component_service_requirement, component: component, name: "Lube",
      distance_meters: 500_000, service_type: hot_wax)
    create(:service_requirement_satisfier, owner: requirement, service_type: drip_wax, position: 2,
      allowance_distance_meters: 250_000)

    dominated_drip = create(:maintenance_event, component: component, service_type: drip_wax,
      performed_at: Time.zone.local(2026, 1, 5))
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 1_000)
    bounding_hot_wax = create(:maintenance_event, component: component, service_type: hot_wax,
      performed_at: Time.zone.local(2026, 1, 15))
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 20), distance_meters: 2_000)
    later_drip = create(:maintenance_event, component: component, service_type: drip_wax,
      performed_at: Time.zone.local(2026, 1, 25))

    bundle = bundle_for(requirement, bike.user)

    # The full event list is always present (calendar needs it unconditionally)...
    expect(bundle.events).to eq([ dominated_drip, bounding_hot_wax, later_drip ])
    # ...but only the bounding event and later ones got a computed position --
    # the earlier drip wax is provably dominated by the hot wax that follows it.
    expect(bundle.positions).not_to have_key(dominated_drip.id)
    expect(bundle.positions[bounding_hot_wax.id][:distance]).to eq(1_000)
    expect(bundle.positions[later_drip.id][:distance]).to eq(3_000)
  end

  it "has no cutoff (every event is a candidate) when the largest-allowance satisfier has no occurrence yet" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain", acquired_on: Date.new(2026, 1, 1))
    create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1))
    hot_wax = create(:service_type, user: bike.user, name: "Hot Wax")
    drip_wax = create(:service_type, user: bike.user, name: "Drip Wax")
    requirement = create(:component_service_requirement, component: component, name: "Lube",
      distance_meters: 500_000, service_type: hot_wax)
    create(:service_requirement_satisfier, owner: requirement, service_type: drip_wax, position: 2,
      allowance_distance_meters: 250_000)

    only_drip = create(:maintenance_event, component: component, service_type: drip_wax,
      performed_at: Time.zone.local(2026, 1, 5))
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 1_000)

    bundle = bundle_for(requirement, bike.user)

    expect(bundle.positions).to have_key(only_drip.id)
    expect(bundle.positions[only_drip.id][:distance]).to eq(0)
  end

  it "includes every requirement regardless of enabled, for .for_component's own use" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain")
    wax = create(:service_type, user: bike.user)
    requirement = create(:component_service_requirement, component: component, name: "Disabled",
      distance_meters: 300_000, service_type: wax, enabled: false)
    create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1))
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1), distance_meters: 5_000)

    bundle = bundle_for(requirement, bike.user)

    expect(bundle.positions[:now][:distance]).to eq(5_000)
  end

  it "needs no SQL checkpoint at all for a calendar-only requirement" do
    component = create(:component, acquired_on: Date.new(2026, 1, 1))
    wax = create(:service_type, user: component.user)
    requirement = create(:component_service_requirement, component: component, name: "Yearly",
      distance_interval_meters: nil, calendar_amount: 1, calendar_unit: "year", service_type: wax)

    bundle = bundle_for(requirement, component.user)

    expect(bundle.positions).to eq({})
    expect(bundle.baseline_at).to be_present
  end
end
