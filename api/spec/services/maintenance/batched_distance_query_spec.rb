require "rails_helper"

RSpec.describe Maintenance::BatchedDistanceQuery do
  it "sums only activity after the most recent matching maintenance event" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain")
    service_type = create(:service_type, user: bike.user, name: "wax")
    interval = create(:component_service_interval, component: component, service_type: service_type,
      distance_interval_meters: 300_000)
    create(:component_assignment, component: component, bike: bike,
      started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
    create(:maintenance_event, component: component, service_type: service_type,
      performed_at: Time.zone.local(2026, 1, 15, 12, 0))
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10, 9, 0), distance_meters: 3_000)
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 20, 9, 0), distance_meters: 4_000)

    result = described_class.call(bike.user)

    expect(result[interval.id].distance_meters).to eq(4_000)
  end

  it "falls back to the earliest assignment start, then acquired_on, when there is no event" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain", acquired_on: Date.new(2025, 1, 1))
    service_type = create(:service_type, user: bike.user, name: "wax")
    interval = create(:component_service_interval, component: component, service_type: service_type,
      distance_interval_meters: 300_000)
    create(:component_assignment, component: component, bike: bike,
      started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10, 9, 0), distance_meters: 5_000)

    result = described_class.call(bike.user)

    expect(result[interval.id].distance_meters).to eq(5_000)
    expect(result[interval.id].baseline_at).to be_within(1.second).of(Time.zone.local(2026, 1, 1))
  end

  it "respects each assignment's ride_context, matching StravaActivity#indoor/#outdoor" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "cassette")
    service_type = create(:service_type, user: bike.user, name: "wax")
    interval = create(:component_service_interval, component: component, service_type: service_type,
      distance_interval_meters: 300_000)
    create(:component_assignment, component: component, bike: bike, ride_context: "indoor_only",
      started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10, 9, 0),
      distance_meters: 10_000, trainer: false)
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 11, 9, 0),
      distance_meters: 7_000, trainer: false, activity_type: "VirtualRide")

    result = described_class.call(bike.user)

    expect(result[interval.id].distance_meters).to eq(7_000)
  end

  it "includes disabled intervals too -- enabled-only filtering happens a layer up, in IntervalStatus.for_user" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain")
    service_type = create(:service_type, user: bike.user, name: "wax")
    interval = create(:component_service_interval, component: component, service_type: service_type, enabled: false)
    create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10, 9, 0), distance_meters: 5_000)

    result = described_class.call(bike.user)

    expect(result[interval.id].distance_meters).to eq(5_000)
  end

  describe "parity with the existing per-assignment methods" do
    it "matches Component#total_distance when there is no matching event yet" do
      bike = create(:bike)
      component = create(:component, user: bike.user, category: "chain")
      service_type = create(:service_type, user: bike.user, name: "wax")
      interval = create(:component_service_interval, component: component, service_type: service_type)
      create(:component_assignment, component: component, bike: bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))
      create(:component_assignment, component: component, bike: bike,
        started_at: Time.zone.local(2026, 3, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 15, 9, 0), distance_meters: 5_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 3, 15, 9, 0), distance_meters: 8_000)

      result = described_class.call(bike.user)

      expect(result[interval.id].distance_meters).to eq(component.total_distance)
    end

    it "matches Component#distance_since when there is a matching event" do
      bike = create(:bike)
      component = create(:component, user: bike.user, category: "chain")
      service_type = create(:service_type, user: bike.user, name: "wax")
      interval = create(:component_service_interval, component: component, service_type: service_type)
      create(:component_assignment, component: component, bike: bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:maintenance_event, component: component, service_type: service_type,
        performed_at: Time.zone.local(2026, 2, 1, 12, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 15, 9, 0), distance_meters: 5_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 15, 9, 0), distance_meters: 8_000)

      result = described_class.call(bike.user)

      expect(result[interval.id].distance_meters).to eq(component.distance_since(service_type: service_type))
    end
  end
end
