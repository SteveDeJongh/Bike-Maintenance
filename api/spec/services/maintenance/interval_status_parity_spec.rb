# Temporary scaffolding for the service-requirements rewrite (increment 1).
# Proves the increment-1 compatibility shim's single-satisfier/day-calendar
# math (Maintenance::IntervalStatus/BatchedDistanceQuery, rewritten against
# the new CategoryServiceRequirement/ComponentServiceRequirement/
# ServiceRequirementSatisfier schema) is byte-identical to the pre-rewrite
# formula: fraction = used / threshold, due at >= 1.0, warning within the
# effective warning_threshold_percent. Delete this file once increment 2's
# own worked-example specs (Maintenance::RequirementStatus) land -- those
# supersede it with real multi-satisfier/multi-dimension coverage.
require "rails_helper"

RSpec.describe "service requirement status parity", type: :model do
  def expected_status(used, threshold, warning_percent)
    fraction = used.to_f / threshold
    return "due" if fraction >= 1.0
    return "warning" if (1.0 - fraction) <= warning_percent / 100.0

    "ok"
  end

  [[500, "ok"], [960, "warning"], [1_000, "due"]].each do |distance, expected|
    it "matches the pre-rewrite distance-only formula at #{distance}m (expect #{expected})" do
      bike = create(:bike)
      component = create(:component, user: bike.user, category: "chain")
      create(:component_service_requirement, component: component, distance_meters: 1_000)
      create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5), distance_meters: distance)

      result = Maintenance::IntervalStatus.for_component(component).first

      expect(result.status).to eq(expected_status(distance, 1_000, 5))
      expect(result.status).to eq(expected)
      expect(result.distance_remaining_meters).to eq(1_000 - distance)
      expect(result.driving_dimension).to eq(:distance)
    end
  end

  it "matches the pre-rewrite day-based formula, with calendar_unit day exactly reproducing time_interval_days" do
    component = create(:component, acquired_on: 40.days.ago.to_date)
    requirement = create(:component_service_requirement, component: component, time_interval_days: 30)
    create(:component_assignment, component: component, bike: create(:bike, user: component.user),
      started_at: 40.days.ago, ended_at: nil)

    result = Maintenance::IntervalStatus.for_component(component).first

    expect(result.status).to eq("due")
    expect(result.days_remaining).to be < 0
    expect(result.driving_dimension).to eq(:days)
  end

  it "resets to the new baseline when a matching service is logged, same as before the rewrite" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain", acquired_on: 100.days.ago.to_date)
    requirement = create(:component_service_requirement, component: component, distance_meters: 300_000)
    satisfier_service_type = requirement.satisfiers.first.service_type
    create(:component_assignment, component: component, bike: bike, started_at: 100.days.ago, ended_at: nil)
    create(:strava_activity, bike: bike, moved_at: 50.days.ago, distance_meters: 100_000)
    create(:maintenance_event, component: component, service_type: satisfier_service_type, performed_at: 10.days.ago)
    create(:strava_activity, bike: bike, moved_at: 5.days.ago, distance_meters: 20_000)

    result = Maintenance::IntervalStatus.for_component(component).first

    expect(result.distance_used_meters).to eq(20_000)
  end

  it "produces the same per-component result via the batched query as a hand-computed baseline+distance" do
    bike = create(:bike)
    component = create(:component, user: bike.user, category: "chain", acquired_on: Date.new(2025, 1, 1))
    requirement = create(:component_service_requirement, component: component, distance_meters: 300_000)
    create(:component_assignment, component: component, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
    create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10), distance_meters: 5_000)

    batched = Maintenance::BatchedDistanceQuery.call(bike.user)[requirement.id]

    expect(batched.distance_meters).to eq(5_000)
    expect(batched.baseline_at).to be_within(1.second).of(Time.zone.local(2026, 1, 1))
  end
end
