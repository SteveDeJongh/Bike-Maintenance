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
end
