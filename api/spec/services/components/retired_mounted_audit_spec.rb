require "rails_helper"

RSpec.describe Components::RetiredMountedAudit do
  let(:user) { create(:user) }
  let(:bike) { create(:bike, user: user) }

  it "flags open assignments and ones ending after retired_on's day, ignoring clean ones, and changes nothing" do
    still_mounted = create(:component, user: user, category: "chain", retired_on: Date.new(2026, 3, 1))
    open_one = create(:component_assignment, component: still_mounted, bike: bike, ended_at: nil)

    late = create(:component, user: user, category: "saddle", retired_on: Date.new(2026, 3, 1))
    late_one = create(:component_assignment, component: late, bike: bike, ended_at: Time.zone.local(2026, 3, 5))

    clean = create(:component, user: user, category: "tire_front", retired_on: Date.new(2026, 3, 1))
    create(:component_assignment, component: clean, bike: bike, ended_at: Time.zone.local(2026, 3, 1, 23, 0))

    not_retired = create(:component, user: user, category: "tire_rear")
    create(:component_assignment, component: not_retired, bike: bike, ended_at: nil)

    rows = nil
    expect { rows = described_class.call }.not_to(change { [ ComponentAssignment.maximum(:updated_at), Component.maximum(:updated_at) ] })

    expect(rows.map { |r| [ r.assignment_id, r.reason ] }).to contain_exactly(
      [ open_one.id, "open" ], [ late_one.id, "ends_after_retired_on" ],
    )
  end
end
