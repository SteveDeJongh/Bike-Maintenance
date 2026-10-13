require "rails_helper"

RSpec.describe Component, type: :model do
  it "is valid with a label and category" do
    expect(build(:component, label: "Chain A", category: "chain")).to be_valid
  end

  it "is invalid without a label" do
    component = build(:component, label: nil)

    expect(component).not_to be_valid
    expect(component.errors[:label]).to be_present
  end

  it "is invalid without a category" do
    component = build(:component, category: nil)

    expect(component).not_to be_valid
    expect(component.errors[:category]).to be_present
  end

  it "destroys its component assignments and maintenance events when destroyed" do
    component = create(:component)
    assignment = create(:component_assignment, component: component)
    event = create(:maintenance_event, component: component)

    component.destroy

    expect(ComponentAssignment.exists?(assignment.id)).to be false
    expect(MaintenanceEvent.exists?(event.id)).to be false
  end

  describe "#total_distance" do
    it "sums StravaActivity distance within the component's assignment window" do
      component = create(:component)
      bike = create(:bike)
      create(:component_assignment, component: component, bike: bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 1, 31, 23, 59))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 15, 9, 0), distance_meters: 5_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 2, 1, 9, 0), distance_meters: 9_999)

      expect(component.total_distance).to eq(5_000)
    end

    it "splits same-day distance between two components swapped mid-day" do
      bike = create(:bike)
      chain_a = create(:component, category: "chain")
      chain_b = create(:component, category: "chain")
      create(:component_assignment, component: chain_a, bike: bike,
        started_at: Time.zone.local(2026, 1, 1, 8, 0), ended_at: Time.zone.local(2026, 1, 1, 12, 0))
      create(:component_assignment, component: chain_b, bike: bike,
        started_at: Time.zone.local(2026, 1, 1, 12, 0, 1), ended_at: nil)

      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 1, 9, 0), distance_meters: 20_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 1, 15, 0), distance_meters: 30_000)

      expect(chain_a.total_distance).to eq(20_000)
      expect(chain_b.total_distance).to eq(30_000)
    end
  end

  describe "#distance_since" do
    it "only counts activity after the most recent maintenance event of that type" do
      component = create(:component)
      bike = create(:bike)
      create(:component_assignment, component: component, bike: bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:maintenance_event, component: component, event_type: "wax",
        performed_at: Time.zone.local(2026, 1, 15, 12, 0))
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 10, 9, 0), distance_meters: 3_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 20, 9, 0), distance_meters: 4_000)

      expect(component.distance_since_wax).to eq(4_000)
    end

    it "excludes a ride from earlier the same day as the wax" do
      component = create(:component)
      bike = create(:bike)
      create(:component_assignment, component: component, bike: bike,
        started_at: Time.zone.local(2026, 1, 1), ended_at: nil)
      create(:maintenance_event, component: component, event_type: "wax",
        performed_at: Time.zone.local(2026, 1, 5, 14, 0))

      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5, 9, 0), distance_meters: 20_000)
      create(:strava_activity, bike: bike, moved_at: Time.zone.local(2026, 1, 5, 17, 0), distance_meters: 30_000)

      expect(component.distance_since_wax).to eq(30_000)
    end
  end
end
