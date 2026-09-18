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
        started_on: Time.zone.local(2026, 1, 1), ended_on: Time.zone.local(2026, 1, 31, 23, 59))
      create(:strava_activity, bike: bike, moved_on: Date.new(2026, 1, 15), distance_meters: 5_000)
      create(:strava_activity, bike: bike, moved_on: Date.new(2026, 2, 1), distance_meters: 9_999)

      expect(component.total_distance).to eq(5_000)
    end
  end

  describe "#distance_since" do
    it "only counts activity after the most recent maintenance event of that type" do
      component = create(:component)
      bike = create(:bike)
      create(:component_assignment, component: component, bike: bike,
        started_on: Time.zone.local(2026, 1, 1), ended_on: nil)
      create(:maintenance_event, component: component, event_type: "wax", performed_on: Date.new(2026, 1, 15))
      create(:strava_activity, bike: bike, moved_on: Date.new(2026, 1, 10), distance_meters: 3_000)
      create(:strava_activity, bike: bike, moved_on: Date.new(2026, 1, 20), distance_meters: 4_000)

      expect(component.distance_since_wax).to eq(4_000)
    end
  end
end
