require "rails_helper"

RSpec.describe Maintenance::UpNext do
  let(:user) { create(:user) }
  let(:bike) { create(:bike, user: user) }

  def up_next
    results = Maintenance::RequirementStatus.for_user(user)
    described_class.new(results: results, bikes_by_component: Component.current_bikes_by_component(user), credential: nil)
  end

  # An off-bike component with one due and one ok requirement: building
  # attention looks it up as unmounted, which must not make its ok
  # requirement count as mounted for upcoming (the lookup hash's default
  # block would insert an entry if read with []).
  it "never lists an off-bike component's ok requirement as upcoming" do
    chain = create(:component, user: user, category: "chain", label: "Shelf chain")
    chain.component_service_requirements.destroy_all
    inspect_type = user.service_types.find_by!(name: "inspect")
    wax_type = user.service_types.find_by!(name: "wax")
    create(:component_service_requirement, component: chain, service_type: inspect_type, distance_interval_meters: 10)
    create(:component_service_requirement, component: chain, service_type: wax_type, distance_interval_meters: 1_000_000)
    create(:component_assignment, component: chain, bike: bike, started_at: Time.zone.local(2026, 1, 1), ended_at: Time.zone.local(2026, 2, 1))
    create(:strava_activity, user: user, bike: bike, moved_at: Time.zone.local(2026, 1, 15), distance_meters: 100)

    service = up_next
    expect(service.attention.map { |item| item[:component_label] }).to eq([ "Shelf chain" ])
    expect(service.upcoming).to eq([])
  end

  it "scopes both lists to the components mounted on a bike" do
    other_bike = create(:bike, user: user)
    mine = create(:component, user: user, category: "saddle", label: "Mine")
    theirs = create(:component, user: user, category: "saddle", label: "Theirs")
    [ [ mine, bike ], [ theirs, other_bike ] ].each do |component, target|
      component.component_service_requirements.destroy_all
      create(:component_service_requirement, component: component, service_type: user.service_types.find_by!(name: "inspect"),
        distance_interval_meters: 1_000_000)
      create(:component_assignment, component: component, bike: target, started_at: Time.zone.local(2026, 1, 1))
    end

    expect(up_next.upcoming(bike_id: bike.id).map { |item| item[:component_label] }).to eq([ "Mine" ])
    expect(up_next.upcoming.map { |item| item[:component_label] }).to contain_exactly("Mine", "Theirs")
  end
end
